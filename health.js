#!/usr/bin/env node

/**
 * Network service for calculating CPU of remote machine
 * Some concepts taken from:
 * http://colby.id.au/node/39
 *
 * @author Brendon Crawford
 *
 */


var net = require('net');
var fs = require('fs');


var App = {};
App.prevTotal = {};
App.prevIdle = {};

App.main = function(args) {
    var port, host;
    if (args[2] === '--help') {
	console.log('Usage: health.js [IP, [PORT]]');
	return 1;
    }
    else {
	host = args[2];
	port = args[3];
    }
    if (host === undefined) {
	host = '127.0.0.1';
    }
    else if (!net.isIP(host)) {
	console.log('You must supply a valid IP.');
	return 1;
    }
    if (port === undefined) {
	port = 37778;
    }
    else if (isNaN(port)) {
	console.log('Port is invalid.');
	return 1;
    }
    else {
	port = parseInt(port);
    }
    console.log("Listening on", host, "port", port);
    net.createServer(App.connected).listen(port, host);
    return 0;
};

App.connected = function (socket) {
    socket.setEncoding("utf8");
    setInterval(function() {
	App.process(socket);
    }, 1000);
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
    var allStats, o;
    allStats = App.build(data);
    o = App.output(allStats);
    socket.write(o);
    //socket.end();
    return true;
};

App.output = function (allStats) {
    var o;
    o = "";
    for (i = 0, ii = allStats.length; i < ii; i++) {
	s = allStats[i];
	o += s[1].toFixed(2);
	if (i < (ii - 1)) {
	    o += " ";
	}
    }
    o += "\n";
    return o;
};

App.build = function(data) {
    var d, i, ii, s, fields, thisStat, cpu, cpuIdent, allStats;
    d = data.split("\n");
    allStats = [];
    for (i = 0, ii = d.length; i < ii; i++) {
	s = d[i];
	if (s.substr(0, 3) === 'cpu') {
	    fields = s.split(/\s+/g);
	    cpu = fields.splice(0, 1)[0];
	    cpuIdent = cpu.charAt(3);
	    cpuIndex = null;
	    if (cpuIdent === '') {
		cpuIndex = -1;
	    }
	    else if (!isNaN(cpuIdent)) {
		cpuIndex = parseInt(cpuIdent);
	    }
            //console.log(cpuIndex);
	    if (cpuIndex !== null) {
		thisStat = App.getStatRow(cpuIndex, fields);
		allStats.push([cpuIndex, thisStat]);
	    }
	}
    }
    return allStats;
};

App.getStatRow = function(cpuIndex, fields) {
    var calc, diffUsage;
    //console.log(App.prevTotal[cpuIndex]);
    if (App.prevTotal[cpuIndex] === undefined) {
	App.prevTotal[cpuIndex] = 0;
    }
    if (App.prevIdle[cpuIndex] === undefined) {
	App.prevIdle[cpuIndex] = 0;
    }
    //console.log(cpuIndex);
    calc = App.calculate(cpuIndex, fields,
			 App.prevIdle[cpuIndex],
			 App.prevTotal[cpuIndex]);
    //console.log(calc);
    diffUsage = calc[0];
    App.prevIdle[cpuIndex] = calc[1];
    App.prevTotal[cpuIndex] = calc[2];
    return diffUsage;
};

App.calculate = function(cpuIndex, fields, prevIdle, prevTotal) {
    var idle, total, diffIdle, prevTotal;
    idle = fields[3];
    total = fields.reduce(function (p, c) {
	return (parseInt(p) + parseInt(c));
    });
    diffIdle = idle - prevIdle;
    diffTotal = total - prevTotal;
    diffUsage = (((diffTotal - diffIdle) / diffTotal) * 100);
    out = [diffUsage, idle, total];
    return out;
};

App.main(process.argv);
