#!/usr/bin/env node

/**
 * Network service for calculating CPU of remote machine.
 * Another project by Last.VC <http://last.vc>
 *
 * Tested on Node.js 0.2.3 and 0.2.4
 * This will only run on Linux. OSX and BSD are not supported
 *
 * @author Brendon Crawford
 * @note Some concepts taken from http://colby.id.au/node/39
 * @see http://colby.id.au/node/39
 * @see https://github.com/brendoncrawford/healthjs
 *
 * @license
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */


var net = require('net');
var fs = require('fs');


var App = {};
App.prevTotal = {};
App.prevIdle = {};

/**
 * Startup
 *
 * @param {Array} args
 * @return {Int}
 */
App.main = function(args) {
    var port, host;
    if (args[2] === '--help') {
        console.log('Usage: health.js [IP, [PORT]]');
        return 0;
    }
    else {
        host = args[2];
        port = args[3];
    }
    if (host === undefined) {
        host = '127.0.0.1';
    }
    //else if (!net.isIP(host)) {
    //  console.log('You must supply a valid IP.');
    //  return 1;
    //}
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

/**
 * Client Connected
 *
 * @param {Stream} socket
 * @return {Bool}
 */
App.connected = function (socket) {
    var timer;
    socket.setEncoding("utf8");
    socket.on('data', function(msg) {
        var command;
        command = App.getCommand(msg);
        socket.removeAllListeners('data');
        if (command === 1) {
            App.process(socket, true);
        }
        else if (command === 2) {
            App.loop(socket);
        }
        return true;
    });
    return true;
};

/**
 * Extracts input command
 *
 * @param {String} msg
 * @return {Int}
 */
App.getCommand = function (msg) {
    var out, t, p;
    p = msg.replace(/^\s+|\s+$/g, '').split(/\s+/g);
    out = 0;
    if (p.length === 3) {
        if (p[0].toLowerCase() === 'get') {
            if (p[1].toLowerCase() === 'cpu') {
                t = p[2];
                if (t !== undefined) {
                    t = t.toLowerCase();
                    if (t === 'once') {
                        out = 1;
                    }
                    else if (t === 'loop') {
                        out = 2;
                    }
                }
            }
        }
    }
    return out;
};

/**
 * Infinite loop over cpu extraction process
 *
 * @param {Stream} socket
 * @return {Bool}
 */
App.loop = function(socket) {
    var timer;
    timer = setInterval(function() {
        if (socket.readyState === 'open') {
            App.process(socket, false);
            return true;
        }
        else {
            clearInterval(timer);
            socket.end();
            return false;
        }
    }, 2000);
    return true;
};

/**
 * Process cpu stats extraction
 *
 * @param {Stream} socket
 * @param {Bool} closeIt
 * @return {Bool}
 */
App.process = function (socket, closeIt) {
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
        App.gotStats(socket, fData, closeIt);
        return true;
    });
    return true;
};

/**
 * After stats have been extracted
 *
 * @param {Stream} scoket
 * @param {String} data
 * @param {Bool} closeIt
 * @return {Bool}
 */
App.gotStats = function(socket, data, closeIt) {
    var allStats, o;
    allStats = App.build(data);
    o = App.output(allStats);
    socket.write(o);
    if (closeIt) {
        socket.end();
    }
    return true;
};

/**
 * Formats output to client
 *
 * @param {Array} allStats
 * @return {String}
 */
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

/**
 * Builds stats based on raw data
 *
 * @param {String} data
 * @return {Array} 
 */
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
            if (cpuIndex !== null) {
                thisStat = App.getStatRow(cpuIndex, fields);
                allStats.push([cpuIndex, thisStat]);
            }
        }
        else {
            break;
        }
    }
    return allStats;
};

/**
 * Get a single stat item
 *
 * @param {Int} cpuIndex
 * @param {Array} fields
 * @return {Float}
 */
App.getStatRow = function(cpuIndex, fields) {
    var calc, diffUsage;
    if (App.prevTotal[cpuIndex] === undefined) {
        App.prevTotal[cpuIndex] = 0;
    }
    if (App.prevIdle[cpuIndex] === undefined) {
        App.prevIdle[cpuIndex] = 0;
    }
    calc = App.calculate(cpuIndex, fields,
                         App.prevIdle[cpuIndex],
                         App.prevTotal[cpuIndex]);
    diffUsage = calc[0];
    App.prevIdle[cpuIndex] = calc[1];
    App.prevTotal[cpuIndex] = calc[2];
    return diffUsage;
};

/**
 * Perform stat calculations
 * 
 * @param {Int} cpuIndex
 * @param {Array} fields
 * @param {Int} prevIdle
 * @param {Int} prevTotal
 * @return {Array}
 */
App.calculate = function(cpuIndex, fields, prevIdle, prevTotal) {
    var idle, total, diffIdle, prevTotal;
    idle = fields[3];
    total = fields.reduce(function (p, c) {
       return (parseInt(p) + parseInt(c));
    });
    diffIdle = idle - prevIdle;
    diffTotal = total - prevTotal;
    if (diffTotal === 0) {
       diffUsage = 0.0;
    }
    else {
        diffUsage = (((diffTotal - diffIdle) / diffTotal) * 100);
    }
    out = [diffUsage, idle, total];
    return out;
};

var ret = App.main(process.argv);
if (ret > 0) {
    process.exit(ret);
}


