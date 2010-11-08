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
    o = App.build(data);
    socket.write(o);
    socket.end();
    return true;
};

App.build = function(data) {
    var d, i, ii, s, fields, thisStat, cpu, cpuIdent, allStats;
    d = data.split("\n");
    for (i = 0, ii = d.length; i < ii; i++) {
	s = d[i];
	if (s.substr(0, 3) === 'cpu') {
	    fields = s.split(/\s+/g);
	    cpu = fields.splice(0, 1);
	    cpuIdent = cpu.charAt(3);
	    cpuIndex = null;
	    if (cpuIdent === '') {
		cpuIndex = 0;
	    }
	    else if (!isNaN(cpuIdent)) {
		cpuIndex = parseInt(cpuIdent);
	    }
	    if (cpuIndex !== null) {
		thisStat = App.getStat(cpuIndex, fields);
		allStats.push(thisStat);
	    }
	}
    }
    return d[0];
};

App.getStatRow = function(cpuIndex, fields) {
    var calc, diffUsage;
    if (App.prevTotal[cpuIndex] === undefined) {
	App.prevTotal[cpuIndex] = 0;
    }
    if (App.prevIdle[cpuIndex] === undefined) {
	App.prevIdle[cpuIndex] = 0;
    }
    calc = App.calculate(cpuIndex, fields,
			App.prevIdle[cpuIndex], App.prevTotal[cpuIndex]);
    diffUsage = calc[0];
    App.prevIdle[cpuIndex] = calc[1];
    App.prevTotal[cpuIndex] = calc[2];
    return diffUsage;
};

App.calculate = function(fields, prevIdle, prevTotal) {
    var idle, total, diffIdle, prevTotal;
    idle = fields[4];
    total = fields.reduce(function (p, c) {
	return (parseInt(p) + parseInt(c));
    });
    diffIdle = idle - prevIdle;
    diffTotal = total - prevTotal;
    diffUsage = ((((1000 * (diffTotal - diffIdle)) / diffTotal) + 5) / 10);
    out = [diffUsage, prevIdle, prevTotal];
    return out;
};



net.createServer(App.main).listen(8124, "127.0.0.1");

