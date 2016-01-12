# AWS Lambda Forwarder for SES Email

Accept incoming email with AWS SES - use this AWS Lambda function to forward it somewhere else.

## Features
* No server required thanks to AWS Lambda
* Simple regex-based forwarding rules
* Free for basic usage, super cheap at scale:
  * SES free tier: 2,000 emails/day (1000 in, 1000 out)
  * SNS free tier: 1,000,000 requests/month
  * S3 free tier: 5 GB storage and 2,000 put requests/month
* SES defaults allow for up to 2000 domains (no per-domain cost)

### Attachment handling
SES has the folling email size limitations:
* Receiving email: 30MB
* Sending email: 10MB

To avoid dropping attachments due of this inconsistency, this tool saves all attachments in S3 and inserts links into the email. Attachment links should be almost impossible to guess, but are they are also public - **if you share them, anyone can download your attachments**!

## Deployment
1. Create an S3 bucket for SES to store emails in.
2. Optionally create a different S3 bucket for attachments (or use the same bucket for both).
3. Setup SES
  3. Add your domains to SES and verify them.
  3. Add a new Rule to your active Rule Set.
  3. Add up to 20 recipients per Rule.
  3. Configure an S3 Action for your Rule using the bucket you created.
  3. Set a meaningful Object Key Prefix.
  3. Select "Create SNS Topic" and pick a meaningful topic name.
4. Create a role for this Lambda function in IAM.  See "SampleIAMPolicy.json" for an example.
5. Create a new Lambda function.
  5. Zip up the function: `npm install && zip -r aws-lambda-ses-forwarding.zip node_modules config.js index.js`
  5. Upload the `aws-lambda-ses-forwarding.zip` file in the Lambda console.
  5. Add an Event Source of type SNS, and subscribe to the SNS topic you setup in SES.
  5. If you want to handle large attachments, increase the RAM to 512MB and the timeout to 2 minutes.

To update the lambda function or config:
1. Create a new ZIP file: `npm install && zip -r aws-lambda-ses-forwarding.zip node_modules config.js index.js`
2. Upload using the web interface OR this command: `aws lambda update-function-code --function-name YOUR-FUNCTION-NAME --zip-file fileb://aws-lambda-ses-forwarding.zip --publish`


## Configuration
* Attachments are stored in S3 at attachmentsBucket/attachmentsPrefix/...
* Delivery rules are regular expressions based on the "Object key prefix"
  * Configured under SES -> Rule Sets -> Actions
  * Default SES limits allow for 100 different rules, each with different "Object key prefix"
* Only the first matching delivery rule is used
* The delivery rule subject is used as prefix to original subject

## Sample "config.js"
```
"use strict";

var config = {
    "attachmentsBucket": "mybucket.mydomain.com",
    "attachmentsPrefix": "attachments",
    "debug": true,
    "rules": { // first match
        "^mail.example.com$": { // exact "Object key prefix" match
            "to": "somerecipient@yourdomain.com",
            "from": "mail <mail@yourdomain.com>",
            "subject": "[mail] ",
        },
        "example.com": { // matches any "Object key prefix" containing "example.com"
            "to": "somerecipient+wildcard@yourdomain.com",
            "from": "mail <mail@yourdomain.com>",
            "subject": "",
        },
        ".*": { // matches everything - don't forget the dot!
            "to": "catchall@yourdomain.com",
            "from": "mail <mail@yourdomain.com>",
            "subject": "[catchall] ",
        }
    }
}

module.exports = config
```

## Props to:
* Lambda SES sending example: https://github.com/eleven41/aws-lambda-send-ses-email
* Alternative implementation: https://github.com/arithmetric/aws-lambda-ses-forwarder


