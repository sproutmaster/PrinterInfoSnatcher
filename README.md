# Printer Info Snatcher
Scrapes and returns printer info as JSON to be used as a microservice or an api

### To run
```
node app.js
```
### Request format
>http://localhost:8000?ip=printer_ip

### Docker Instructions

#### Building Image
```
docker build . -t username/printer-info-snatcher
```
#### Running Image
```
docker run -p port:8000 -d username/printer-info-snatcher
```