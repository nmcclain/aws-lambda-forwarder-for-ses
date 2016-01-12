 // aws-lambda-ses-forwarding

var version = "0.1.000";
var aws = require("aws-sdk");
var uuid = require("node-uuid");
var async = require("async");

var ses = new aws.SES();
var s3 = new aws.S3();

var containerReuse = 0;

exports.handler = function(event, context) {
    console.log(version);
    if (containerReuse > 0) {
        console.log("Container reuse == ", containerReuse);
    }
    containerReuse++;

    var MailParser = require("mailparser").MailParser;
    var mailparser = new MailParser();
    var fs = require("fs");

    var config = require("./config.js");

    if (config.debug) {
        console.log("New event: ", JSON.stringify(event));
    }
    if (event.Records == null) {
        context.fail("Error: no records found in SNS message");
        return;
    } else if (event.Records.length != 1) {
        context.fail("Error: wrong # of records in SNS message - we expect exactly one");
        return;
    }

    var record = event.Records[0];
    if (record.EventSource != "aws:sns") {
        context.fail("Error: this doesnt look like an SES Received message");
        return;
    } else if (record.Sns.Type != "Notification" || record.Sns.Subject != "Amazon SES Email Receipt Notification") {
        context.fail("Error: this doesnt look like an SES Email Receipt Notification");
        return;
    }

    var message = JSON.parse(record.Sns.Message);
    if (message.mail.messageId == null) {
        context.fail("Error: mail.messageId is missing");
        return;
    } else if (message.content != null) {
        context.fail("Error: mail content is present - seems like this should be going through S3");
        return;
    } else if (message.receipt.action.type != "S3") {
        context.fail("Error: mail action is not S3!");
        return;
    } else if (!message.receipt.action.bucketName || !message.receipt.action.objectKeyPrefix || !message.receipt.action.objectKey) {
        context.fail("Error: mail S3 details are missing");
        return;
    }

    message.s3Url = "s3://" + message.receipt.action.bucketName + "/" + message.receipt.action.objectKey;
    if (config.debug) {
        console.log("Fetching message from " + message.s3Url);
    }

    s3.getObject({
        Bucket: message.receipt.action.bucketName,
        Key: message.receipt.action.objectKey,
    }, function(err, data) {
        if (err) {
            console.log(err);
            context.fail("Error: Failed to load message from S3");
            return;
        }

        var rawEmail = data.Body.toString()
        mailparser.on("end", function(parsedmail) {
            // look for a matching rule
            var deliveryRule = null;
            for (var rule in config.rules) {
                var re = new RegExp(rule);
                if (re.test(message.receipt.action.objectKeyPrefix)) {
                    deliveryRule = config.rules[rule];
                    break;
                }
            }
            if (deliveryRule === null) {
                console.log("Skipped: No matching rule", message.receipt.action.objectKeyPrefix);
                context.succeed("Skipped: No matching rule.");
                return;
            }

            var subject = deliveryRule.subject + parsedmail.subject + " [" + parsedmail.from[0].address + " -> " + parsedmail.to[0].address + "]"
            if (config.debug) {
                console.log("Subject: " + subject);
                console.log("Body: " + parsedmail.text);
                console.log("Object Key Prefix: " + message.receipt.action.objectKeyPrefix);
            }

            var params = {
                Destination: {
                    ToAddresses: [deliveryRule.to]
                },
                Source: deliveryRule.from,
                ReplyToAddresses: [message.mail.source],
                Message: {
                    Subject: {
                        Data: subject,
                        Charset: "UTF-8"
                    },
                    Body: {
                        Text: {
                            Data: parsedmail.text,
                            Charset: "UTF-8"
                        }
                    }
                }
            };
            if (parsedmail.html && parsedmail.html.length > 0) {
                params.Message.Body.Html = {
                    Data: parsedmail.html,
                    Charset: "UTF-8"
                };
            }

            var objs = [];
            var linkText = "";
            var linkHTML = "<div style='margin-bottom: 20px; padding: 40px; background-color: #bdc3c7; '>";
            if (parsedmail.attachments) { // link to attachments in S3
                if (config.debug) {
                    console.log("Handling " + parsedmail.attachments.length + " attachments");
                }
                parsedmail.attachments.forEach(function(attachment) {
                    var prefix = config.attachmentsPrefix + "/" + uuid.v4() + "/";
                    objs.push({
                        Bucket: config.attachmentsBucket,
                        Key: prefix + attachment.fileName,
                        ACL: "public-read",
                        Body: attachment.content
                    });
                    var url = "https://s3.amazonaws.com/" + config.attachmentsBucket + "/" + prefix + encodeURIComponent(attachment.fileName);
                    linkText += attachment.fileName + ": " + url + "\n";
                    linkHTML += "<a href='" + url + "'>Attachment <b>" + attachment.fileName + "</b></a>" + "<br>\n";
                });
                if (linkText.length > 0) {
                    linkText = parsedmail.attachments.length + " ATTACHMENTS:\n" + linkText + "___________________________________________________________\n\n";
                }
                linkHTML += "</div>\n";
                if (config.debug) {
                    console.log(linkText);
                }
                params.Message.Body.Text.Data = linkText + params.Message.Body.Text.Data;
                if (params.Message.Body.Html) {
                    params.Message.Body.Html.Data = linkHTML + params.Message.Body.Html.Data;
                }
            }
            async.each(objs,
                function(item, callback) {
                    s3.putObject(item, callback);
                },
                function(err) {
                    if (err) {
                        console.log(err);
                        context.fail("Error posting attachments to S3");
                        return;
                    }

                    // send email once all attachments are handled
                    ses.sendEmail(params, function(err, data) {
                        if (err) {
                            console.log(err);
                            context.fail("Error: SES send failed");
                            return;
                        }
                        if (config.debug) {
                            console.log("Successful send to: " + deliveryRule.to);
                        }
                        context.succeed("Successful send to: " + deliveryRule.to);
                        return;
                    });
                    return;
                }
            );

        });
        mailparser.write(rawEmail);
        mailparser.end();
    });
};
