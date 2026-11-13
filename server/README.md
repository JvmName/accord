# API Endpoints
The generated `openapi.json` (served at `/docs` in development) is the complete reference; this file is a summary.

Every response is an envelope: `{ "status": "ok", "data": { ... } }`. Errors are `{ "status": "bad request" | "unauthorized" | "not found" | "unprocessable entity", "data": { "errors": { "field": ["message"] } } }` (`data` is `null` for a plain 401 or 404).

All endpoints require an API token in the `x-api-token` header, except `POST /users` (the token is returned there), `GET /mat/:matId`, and `POST /mat/:matCode/join` (an anonymous join creates the user and returns its token). The response examples below show the `data` part.

## Users

### Create a User
`POST /users`
##### request parameters
`name`
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
`name`, `judge_count` (optional, 1 to 3; default 1)
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
##### request parameters
`name` (optional. default: "Anonymous")
##### response
```
{
  "mat": MAT_PAYLOAD (includes `judges`)
  "user": USER_PAYLOAD,
  "api_token": "81e15f46-133c-4236-bb67-1329f233eea7"
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
`red[name]` OR `red[id]`, `blue[name]` OR `blue[id]`

*Passing a name will create a new user. Passing an id will use an existing user*
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

Master only. Takes no parameters: it stops the clock and starts the break. Record who won with "Set a Round Result".
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

### Set a Round Result
`PATCH /match/:matchId/rounds/result`

Master only. Valid only during the break or after the match has ended.
##### request parameters
`winner` ("red" or "blue", optional; omit to clear the result), `stoppage` (boolean, optional)
##### response
```
{
  "match": MATCH_PAYLOAD (includes `mat` and `rounds`)
}
```

### Pause or Resume a Round
`POST /match/:matchId/rounds/pause`, `POST /match/:matchId/rounds/resume`

Master only (judges cannot pause). Answers 422 when there is no active round, or the round is not paused.

### Start or End Riding Time
`POST /match/:matchId/ridingTime` with `rider` ("red" or "blue"), and `DELETE /match/:matchId/ridingTime`

A judge's vote that a competitor has control. `DELETE` ends the judge's open vote; `rider` is ignored there.

### End a Match
`POST /match/:matchId/end`
##### response
```
{
  "match": MATCH_PAYLOAD (includes `mat`, `judges` and `rounds`)
}
```

### Get a Match
`GET /match/:matchId` (any authenticated user)
##### response
```
{
  "match": MATCH_PAYLOAD (includes `mat`, `judges` and `rounds`)
}
```


# Web Sockets
## Connecting to the Web Socket Server
Here is a JavaScript example of for connection to and authenticating with the web socket server
```
const { io } = require('socket.io-client');
const socket = io(apiRoot, {
    auth: {apiToken: myToken},
    transports: ["websocket"]
}); 
```

## Joining a Match
Once connected to the web socket server, emit the event `match.join` with the `matchId` as the only argument.

## Listening for Match Updates
Listen to the event `match.update` to receive updates about once a second while a round is open or a break is running. The payload is the `MATCH_PAYLOAD` with `rounds`. Two more events carry the same payload: `round.tech-fall` (a competitor reached the tech-fall score and the round ended) and `break.ended` (the next round has started).

A handshake without a valid `auth.apiToken` is refused with a `connect_error` (`unauthorized`).


# Response Payloads

## User
```
{
    "id": "6e8dc5f0-eb35-4c5c-aa64-d0177eb05c12",
    "name": "Dick Grayson",
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
    "codes": [                           // only included on mat creation; the admin code adds judges
        {
            "code": "pig.eagle.camel",
            "role": "admin"
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
    "break_started_at": null,
    "break_duration": null,       // seconds
    "break_remaining": null,      // seconds left in a break, computed on every render; null outside a break
    "winner": USER_PAYLOAD,       // null until all three rounds have ended, or on a draw
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
    "id": "c7b62fb7-9a67-4926-a23f-17dcd58a3f75",
    "started_at": "2026-01-01T12:08:10.000Z",
    "ended_at": "2026-01-01T12:09:40.000Z",   // null while the round is open
    "max_duration": 180,                      // seconds
    "time_remaining": null,                   // seconds; null once ended
    "paused": false,
    "score": {                                // points per competitor id (one point per 3 seconds of control)
        "086d09e1-6909-464c-8518-ca8eccb3edf2": 2,
        "c160ec24-895f-4f70-9563-2a17c046d400": 0
    },
    "result": {
        "winner": USER_PAYLOAD,               // null for a tie
        "method": {
            "type": "points",   // or "submission", "stoppage", "tie"
            "value": "2"                      // points as a string; null for a submission or stoppage
        }
    }
}
```

# Request validation in development

With `NODE_ENV=development` the server checks every request and response against the generated `openapi.json`, and also serves it at `/docs` and `/docs.json`. Set `ACCORD_OPENAPI_VALIDATION=0` to turn the check off, or `=1` to turn it on outside development (tests). It never runs in production.
