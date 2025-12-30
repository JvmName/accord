# API Endpoints
Currently, all endpoints except user creation require authentication via an API token
in the `x-api-token` header. This API token is returned via the user creation endpoint.

## Users

### Create a user
`POST /users`
##### Request Parameters
`email`, `name`
##### Response
```
{
  "user": USER_PAYLOAD,
  "api_token": "81e15f46-133c-4236-bb67-1329f233eea7"
}
```


## Mats

### Create a mat ###
`POST /mats`
##### Request Parameters
`name`, `judge_count`
#### Response
```
{
  "mat": MAT_PAYLOAD (includes `codes` and `judges`)
}
```

<br/>
### Get a mat
`GET /mat/:matId`
`:matId` can be either the id of the mat or a mat code.
##### Response
```
{
  "mat": MAT_PAYLOAD (includes `judges`, `current_match`, and `upcoming_matches`)
}
```

<br/>
### Add a judge or viewer (judge or viewer is determined by the mat code)
`POST /mat/:matCode/join`
##### Response
```
{
  "mat": MAT_PAYLOAD (includes `judges`)
}
```

<br/>
### Remove a judge or viewer (judge or viewer is determined by the mat code)
`DELETE /mat/:matCode/join`
##### Response
```
{
  "mat": MAT_PAYLOAD (includes `judges`)
}
```

<br/>
### List judges
`GET /mat/:matCode/judges`
##### Response
```
{
  "judges": [USER_PAYLOAD]
}
```

<br/>
### List viewers
`GET /mat/:matCode/viewers`
##### Response
```
{
  "viewers": [USER_PAYLOAD]
}
```


# Response Payloads

## User
```
{
    "id": "6e8dc5f0-eb35-4c5c-aa64-d0177eb05c12",
    "name": "Dick Grayson",
    "email": "richard@we.com"
}
```

## Mat
```
{
    "id": "c23869d3-a82b-4fba-bce5-cfb5f5a57140",
    "name": "My Mat",
    "judge_count": 3,
    "creator_id": "086d09e1-6909-464c-8518-ca8eccb3edf2",
    "judges": [USER_PAYLOAD],            // only included in some requests
    "current_match": MATCH_PAYLOAD,      // only included in some requests
    "upcoming_matches": [MATCH_PAYLOAD], // only included in some requests
    "codes": [                           // only included on mat creation
        {
            "code": "pig.eagle.camel",
            "role": "judge"
        },
        {
            "code": "donkey.sea_cucumber.spider",
            "role": "viewer"
        }
    ]
}
```
