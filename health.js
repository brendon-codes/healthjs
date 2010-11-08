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
    var o;
    o = App.calculate(data);
    socket.write(o);
    socket.end();
    return true;
};

App.calculate = function(data) {
    var d, i, ii, s, fields, thisStat, cpu;
    d = data.split("\n");
    for (i = 0, ii = d.length; i < ii; i++) {
	s = d[i];
	if (s.substr(0, 3) === 'cpu') {
	    fields = s.split(/\s+/g);
	    cpu = fields.splice(0, 1);
	    thisStat = App.getStat(fields);
	}
    }
    return d[0];
};

App.getStat = function(fields) {

};

net.createServer(App.main).listen(8124, "127.0.0.1");

