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
