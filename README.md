# accord

A KMP (Android/JVM) client + NodeJS backend that tracks controlled grappling time in the Rdojo Kombat sport. 

See [rdojo.com/kombat](https://www.rdojo.com/kombat) for more information.

## Usage

### Server

```
cd server
npm -i
npm run db:migrate && npm start
```

### Client 
The client supports both Android and Desktop/JVM. 

```
cd app
./gradlew :app:installDebug # android
./gradlew :app:run # JVM desktop
```