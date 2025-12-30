# API Endpoints
Currently, all endpoints except user creation require authentication via an API token
in the `x-api-token` header. This API token is returned via the user creation endpoint.

## Users

### Create a User
`POST /users`
##### request parameters
`email`, `name`
##### response
```
{
  "user": USER_PAYLOAD,
  "api_token": "81e15f46-133c-4236-bb67-1329f233eea7"
}
```


## Mats

### Create a Mat ###
`POST /mats`
##### request parameters
`name`, `judge_count`
#### response
```
{
  "mat": MAT_PAYLOAD (includes `codes` and `judges`)
}
```

### Get a Mat
`GET /mat/:matId` (`:matId` can be either the id of the mat or a mat code.)
##### response
```
{
  "mat": MAT_PAYLOAD (includes `judges`, `current_match`, and `upcoming_matches`)
}
```

### Add a Judge or Viewer (judge or viewer is determined by the mat code)
`POST /mat/:matCode/join`
##### response
```
{
  "mat": MAT_PAYLOAD (includes `judges`)
}
```

### Remove a Judge or Viewer (judge or viewer is determined by the mat code)
`DELETE /mat/:matCode/join`
##### response
```
{
  "mat": MAT_PAYLOAD (includes `judges`)
}
```

### List Judges
`GET /mat/:matCode/judges`
##### response
```
{
  "judges": [USER_PAYLOAD]
}
```

### List Viewers
`GET /mat/:matCode/viewers`
##### response
```
{
  "viewers": [USER_PAYLOAD]
}
```


## MATCHES

### Create a Match
`POST /mat/:matId/matches` (`:matId` can be either the id of the mat or a mat code.)
##### request parameters
`red_competitor_id`, `blue_competitor_id`
##### response
```
{
  "match": MATCH_PAYLOAD (includes `mat`)
}
```

### Start a Match
`POST /match/:matchId/start`
##### response
```
{
  "match": MATCH_PAYLOAD (includes `mat`, `judges` and `rounds`)
}
```

### End a Round
`POST /match/:matchId/rounds/end`
##### response
```
{
  "match": MATCH_PAYLOAD (includes `mat`, `judges` and `rounds`)
}
```

### Start a Round
`POST /match/:matchId/rounds`
##### response
```
{
  "match": MATCH_PAYLOAD (includes `mat`, `judges` and `rounds`)
}
```

### End a Match
`POST /match/:matchId/end`
##### request parameters
`submission` (string with submission name), `submitter` ("red" or "blue") // optional
##### response
```
{
  "match": MATCH_PAYLOAD (includes `mat`, `judges` and `rounds`)
}
```

### Get a Match
`GET /match/:matchId`
##### response
```
{
  "match": MATCH_PAYLOAD (includes `mat`, `judges` and `rounds`)
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

## Match
```
{
    "creator_id": "086d09e1-6909-464c-8518-ca8eccb3edf2",
    "id": "33777df4-3d37-41a3-8b1e-41128fc269f2",
    "mat_id": "1222e44d-5463-4932-9f95-795641c6010e",
    "started_at": null,
    "ended_at": null,
    "red_competitor": USER_PAYLOAD,
    "blue_competitor": USER_PAYLOAD,
    "mat": MAT_PAYLOAD,       // only included in some requests
    "judges": [USER_PAYLOAD], // only included in some requests
    "rounds": [ROUND_PAYLOAD] // only included in some requests
}
```

## Round
```
{
  "started_at": 1767112975218,
  "ended_at": null,
  "submission": "RNC"       // only included in rounds with a submission
  "submitter": USER_PAYLOAD // only included in rounds with a submission
}
```
