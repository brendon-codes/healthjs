#!/usr/bin/env node

var net = require('net');
var fs = require('fs');

var App = {};

App.main = function (socket) {
    socket.setEncoding("utf8");
    App.process(socket);
    return true;
};

App.process = function (socket) {
    var r, fData;
    fData = '';
    r = fs.createReadStream('/proc/stat', {
	'flags' : 'r',
	'encoding' : 'ascii'
    });
    r.addListener('data', function(data) {
	fData += data;
	return true;
    });
    r.addListener('end', function() {
	App.gotStats(socket, fData);
	return true;
    });
    return true;
};

App.gotStats = function(socket, data) {
    socket.write(data);
    socket.end();
    return true;
};


net.createServer(App.main).listen(8124, "127.0.0.1");

