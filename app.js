const net = require('net'),
      fs = require('fs'),
      mime = require('mime'),
      qs = require('querystring'),
      md5 = require('md5'),
      config = require('./config');

const PORT = config.port,
      HOST = config.host;

const parseHttpHeaders = (req) => {
  try {
    let reqStr = req.toString(),
        headersArr = [],
        headersObj = {},
        reqLine = '';  
    
    reqLine = reqStr.slice(0, reqStr.indexOf('\r\n'));
    reqBody = reqStr.slice(reqStr.indexOf('\r\n\r\n'));
    reqStr = reqStr.slice(reqStr.indexOf('\r\n'), reqStr.indexOf('\r\n\r\n') + 1);
  
    headersArr = reqStr.split('\r\n');
    headersArr = headersArr.slice(1);  
  
    for (const h of headersArr) {
      headerPair = h.split(':');
      headersObj[headerPair[0].toLowerCase()] = (headerPair[1]).trim();
    }
  
    headersObj['reqLine'] = reqLine;
    headersObj['reqBody'] = reqBody.replace('\r\n\r\n', '');
    headersObj['reqBody'] = qs.parse(headersObj['reqBody']);
    
    let reqPath = reqLine.split(' ')[1];  
  
    if (reqPath.split('?').length > 1) {
      headersObj['queryString'] = reqPath.split('?')[1];
    }
  
    return headersObj;
  } catch(err) {
    return false;
  }
};

const buildStatusLine = (status = 200) => {
  switch (parseInt(status)) {
    case 302:
      return 'HTTP/1.1 302 Found';
    case 400:
      return 'HTTP/1.1 400 Bad Request';
    case 501:
      return 'HTTP/1.1 501 Not Implemented';
    case 404:
      return 'HTTP/1.1 404 Not Found';
    default:
      return 'HTTP/1.1 200 OK';
  }
}

// callback function when server created
const connectionListener = (socket) => {    
  console.log(`Client: ${socket.remoteAddress}:${socket.remotePort} connected`);    
    
  // 'data' listener 
  socket.on('data', (req) => {
    let resHeaderStr = '',
        resStatus = 200;
        resHeadersObj = { Connection: 'close' },
        resBody = '',
        reqHeadersObj = parseHttpHeaders(req),
        reqLineArr = reqHeadersObj['reqLine'].split(' '),
        reqMethod = reqLineArr[0],
        reqPath = reqLineArr[1],
        reqFormat = reqLineArr[2],
        file = './';

    const reqNotImplemented = () => {
      resBody = '501: Not Implemented';  
      
      socket.write(`${buildStatusLine(501)}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${resBody.length}\r\n\r\n`);
      socket.write(resBody);  
      socket.destroy();    
    };

    const reqBadRequest = () => {
      resBody = 'Only allow GET and POST method';  
      
      socket.write(`${buildStatusLine(501)}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${resBody.length}\r\n\r\n`);
      socket.write(resBody);  
      socket.destroy();    
    };
  
    // console.log(reqHeadersObj);    

    // only allow request format in HTTP/1.1 or HTTP/1.0
    if (!reqHeadersObj) {
      reqBadRequest();
    } else if (reqFormat !== 'HTTP/1.1' && reqFormat !== 'HTTP/1.0') {      
      reqBadRequest();
    } else {
      // only allow GET and POST
      if (reqMethod !== 'GET' && reqMethod !== 'POST') {        
        reqBadRequest();
      } else {
        const reqPathArr = reqPath.split('?');
        switch (reqPathArr[0]) {
          case '/':                       
            socket.write(`${buildStatusLine(302)}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: 0\r\n`);
            socket.write('Location: /hello-world\r\n\r\n');   
            socket.destroy();         
            break;
          case '/hello-world':
            if (reqMethod === 'GET') {
              file = './hello-world.html';

              fs.readFile(file, (err, data) => {
                socket.write(`${buildStatusLine()}\r\nConnection: close\r\nContent-Type: ${mime.lookup(file)}\r\nContent-Length: ${data.byteLength}\r\n\r\n`);
                socket.write(data);   
                socket.destroy();             
              });              
            } else {                            
              if (reqHeadersObj['content-type'] === 'application/x-www-form-urlencoded') {
                file = './hello-world.html';
                let name = reqHeadersObj['reqBody']['name'];

                fs.readFile(file, (err, data) => {
                  resBody = data.toString().replace('__HELLO__', name);
                  
                  socket.write(`${buildStatusLine()}\r\nConnection: close\r\nContent-Type: ${mime.lookup(file)}\r\nContent-Length: ${resBody.length}\r\n\r\n`);
                  socket.write(resBody);
                  socket.destroy();
                });

              } else {                
                reqBadRequest();
              }
            }
            break;
          case '/style':
            if (reqMethod === 'GET') {
              file = './style.css';
              fs.stat(file, (err, stats) => {
                const ctime = stats['ctime'],
                      mtime = stats['mtime'],
                      atime = stats['atime'];
  
                fs.readFile(file, (err, data) => {                                
                  socket.write(`${buildStatusLine()}\r\nConnection: close\r\nContent-Type: ${mime.lookup(file)}; charset=utf-8\r\nContent-Length: ${data.byteLength}\r\n`);
                  socket.write(`ETag: ${md5(data)}\r\n\r\n`);
                  socket.write(data); 
                  socket.destroy();                 
                });
              });
            } else {
              reqNotImplemented();
            }
            break;
          case '/background':     
            if (reqMethod === 'GET') {
              file = './background.jpg';
              fs.readFile(file, (err, data) => {            
                socket.write(`${buildStatusLine()}\r\nConnection: close\r\nContent-Type: ${mime.lookup(file)}; charset=utf-8\r\nContent-Length: ${data.byteLength}\r\n`);
                socket.write(`ETag: ${md5(data)}\r\n\r\n`);
                socket.write(data);
                socket.destroy();                
              });
            } else {
              reqNotImplemented();
            }            
            break;
          case '/info':
            if (reqMethod === 'GET') {
              if (reqPathArr.length !== 1) {
                const queryStringArr = qs.parse(reqPathArr[1]);                              
  
                if (queryStringArr['type'] === 'time') {
                  resBody = Date().toString();
                } else if (queryStringArr['type'] === 'random') {
                  resBody = (Math.round(Math.random() * ((2147483648) - (-2147483648)) + (-2147483648))).toString();
                } else {
                  resBody = 'No Data';
                }
              } else {
                resBody = 'No Data';
              }
  
              socket.write(`${buildStatusLine()}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${resBody.length}\r\n\r\n`);
              socket.write(resBody); 
              socket.destroy();             
            } else {
              reqNotImplemented();
            }            
            break; 
          default:
            resBody = '404 Not Found';

            socket.write(`${buildStatusLine(404)}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${resBody.length}\r\n\r\n`);
            socket.write(resBody);  
            socket.destroy();                
        }
      }
    }
  });

  // 'end' listener
  socket.on('end', () => {
    console.log(`Client: ${socket.remoteAddress}:${socket.remotePort} disconnected`);      
  });

  // 'error' listener
  socket.on('error', (e) => {
    console.log(e);
  });
};

// create new server
const server = net.createServer(connectionListener);

// listen to port given
server.listen(PORT, HOST);
console.log(`Server started at localhost:${PORT}`);