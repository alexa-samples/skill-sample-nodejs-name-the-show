# Name The Show

A sample skill which demonstrates the use of consumables within an Alexa skill.

The skill will present the user with the name of an actor or actress, and the user is asked to guess which television show the skill is thinking of.  If the user can't figure it out, they can buy and use hints, which will give them the name of a second or third actor from the same show.

To use this sample:

1. Ensure you have/complete the necessary prerequisites:
    * Alexa Developer Account
    * AWS Account
    * Intial and initizalize the ASK CLI
    * Install git (optional)
1. Clone the repo: `git clone https://github.com/alexa/skill-sample-nodejs-name-the-show name-the-show`.  If you don't have git installed, down the repo [here](https://)
1. Enter the cloned repo's directory: `cd name-the-show`.
1. Deploy the skill: `ask deploy`
1. Since the skill uses persistent attributes, be sure to add these permissions to the Lambda function's execution role.
    1. If everything was left as the default, this [link](https://console.aws.amazon.com/iam/home#/roles/ask-lambda-Name-The-Show) will take you right to that role.
    1. On the right side of the **Permissions** tab, click **+ Add inline policy**.
    1. Click the **JSON** tab.
    1. Select the existing JSON and replace it with the following policy document.  This policy grants access to the role to (1) create the needed table and (2) read/write items to the table.  It is restricted to this for just a table named 'NameTheShow'.
        ```
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "NameTheShowDynamoDBAccess",
                    "Effect": "Allow",
                    "Action": [
                        "dynamodb:CreateTable",
                        "dynamodb:PutItem",
                        "dynamodb:GetItem",
                        "dynamodb:UpdateItem"
                    ],
                    "Resource": "arn:aws:dynamodb:::table/NameTheShow"
                }
            ]
        }
        ```
    1. Click **Review Policy**.
    1. Enter `NameTheShowDynamoDBAccess` as the **Name**.
    1. Click **Create Policy**.
1. That's it!  The skill should be enabled on your developer account.  Launch the skill by saying, **"Alexa, open name the show"**.
    > Note: the first time you launch it, the DyanmoDB table will be created.  It is normal for an error to be returned while it is being created.  Check back after a few minutes and the skill will work as expected.

## License

This library is licensed under the Amazon Software License.
