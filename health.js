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

/*jslint white: true, devel: true, rhino: true, onevar: true, undef: true, nomen: true, eqeqeq: true, plusplus: false, bitwise: true, regexp: true, newcap: true, immed: true, maxlen: 80 */
/*global require, setInterval, clearInterval, process */
"use strict";

var net = require('net');
var fs = require('fs');
var optparse = require('./lib/optparse');

var App = {};
App.prevTotal = {};
App.prevIdle = {};
App.allStats = {};
App.options = {};
App.threshold = 0;
App.outputData = '';
App.notifyDate = null;

/**
 * Startup
 *
 * @param {Array} args
 * @return {Int}
 */
App.main = function (args) {
    var options;
    App.options = App.getOptions(args);
    App.loop();
    if (App.options.listen !== null) {
        net.createServer(App.connected).listen(App.options.port,
                                               App.options.listen);
    }
    return 0;
};

/**
 * Gets command line arguments
 * Displays help if needed
 *
 * @param {Array} args
 * @return {Object}
 */
App.getOptions = function (args) {
    var options, optParser;
    options = {
        'help' : false,
        'listen' : null,
        'remoteHost' : null,
        'remotePort' : 37779,
        'port' : 37778,
        'thresholdCpu' : 80,
        'thresholdCycles' : 10,
        'cycleTime' : 6000,
        'resendWait' : 720
    };
    optParser = new optparse.OptionParser([
        ['-h', '--help', 'Show this help.'],
        ['-p', '--port NUMBER', 'Port to listen on. Default is 37778.'],
        ['-L', '--listen IP', 'IP to listen on. Default is none.'],
        ['-r', '--remote-host IP',
         'IP to notify when cpu reaches threshold. Default is none.'],
        ['-x', '--remote-port NUMBER',
         'Remote service port for notifications. Default is 37779.'],
        ['-t', '--threshold-cpu NUMBER',
         'Percentage threshold. Default is 80.'],
        ['-y', '--threshold-cycles NUMBER',
         'Number of cycles for notification. Default is 10.'],
        ['-c', '--cycle-time NUMBER',
         'Amount of time for each cycle in milliseconds. Default is 6000.'],
        ['-e', '--resend-wait NUMBER',
         'Amount of time in minutes to wait before ' +
         'resending notification. Default is 720.']
    ]);
    optParser.banner = "Usage: node health.js [OPTIONS]";
    optParser.on('help', function (val) {
        options.help = true;
        return true;
    });
    optParser.on('port', function (name, val) {
        options.port = parseInt(val, 10);
        return true;
    });
    optParser.on('listen', function (name, val) {
        options.listen = val;
        return true;
    });
    optParser.on('remote-host', function (name, val) {
        options.remoteHost = val;
        return true;
    });
    optParser.on('remote-port', function (name, val) {
        options.remotePort = val;
        return true;
    });
    optParser.on('threshold-cpu', function (name, val) {
        options.thresholdCpu = parseInt(val, 10);
        return true;
    });
    optParser.on('threshold-cycles', function (name, val) {
        options.thresholdCycles = parseInt(val, 10);
        return true;
    });
    optParser.on('cycle-time', function (name, val) {
        options.cycleTime = parseInt(val, 10);
        return true;
    });
    optParser.on('resend-wait', function (name, val) {
        options.resendWait = parseInt(val, 10);
        return true;
    });
    optParser.parse(args);
    if (options.help) {
        console.log(optParser.toString());
        process.exit(0);
    }
    return options;
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
    socket.appLastOutput = null;
    socket.on('data', function (msg) {
        var command;
        command = App.getCommand(msg);
        socket.removeAllListeners('data');
        if (command === 1) {
            App.sendOutputToClient(socket, true);
        }
        if (command === 2) {
            App.loopOutputToClient(socket);
        }
        return true;
    });
    return true;
};

/**
 * Send output to client
 *
 * @param {Stream} socket
 * @param {Bool} closeIt
 * @return {Bool}
 */
App.sendOutputToClient = function (socket, closeIt) {
    socket.write(App.outputData);
    if (closeIt) {
        socket.end();
    }
    return true;
};

/**
 * Loops output to client
 * 
 * @param {Stream} socket
 * @return {Bool}
 */
App.loopOutputToClient = function (socket) {
    var timer;
    timer = setInterval(function () {
        if (socket.readyState === 'open') {
            if (socket.appLastOutput === null ||
                    socket.appLastOutput !== App.outputData) {
                App.sendOutputToClient(socket, false);
                socket.appLastOutput = App.outputData;
            }
            return true;
        }
        else {
            socket.end();
            clearInterval(timer);
            return false;
        }
    }, parseInt(App.options.cycleTime / 2, 10));
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
 * @return {Bool}
 */
App.loop = function () {
    var timer;
    timer = setInterval(function () {
        App.process();
        return false;
    }, App.options.cycleTime);
    return true;
};

/**
 * Process cpu stats extraction
 *
 * @return {Bool}
 */
App.process = function () {
    var r, fData;
    fData = '';
    r = fs.createReadStream('/proc/stat', {
        'flags' : 'r',
        'encoding' : 'ascii'
    });
    r.addListener('data', function (data) {
        fData += data;
        return true;
    });
    r.addListener('end', function () {
        App.gotStats(fData);
        return true;
    });
    return true;
};

/**
 * After stats have been extracted
 *
 * @param {String} data
 * @return {Bool}
 */
App.gotStats = function (data) {
    var allStats, o;
    App.allStats = App.build(data);
    App.outputData = App.output(App.allStats);
    if (App.options.remoteHost !== null) {
        App.checkNotifications();
    }
    return true;
};

/**
 * Checks thresholds
 *
 * @return {Bool}
 */
App.checkNotifications = function () {
    var s, st, found, nd, td;
    for (s in App.allStats) {
        if (App.allStats.hasOwnProperty(s)) {
            st = App.allStats[s];
            if (st >= App.options.thresholdCpu) {
                App.threshold++;
                found = true;
                break;
            }
        }
    }
    if (!found) {
        App.threshold = 0;
    }
    if (App.threshold >= App.options.thresholdCycles) {
        nd = new Date();
        td = (App.options.resendWait * 60 * 1000);
        //console.log(nd, td, App.notifyDate);
        if (App.notifyDate === null || ((nd - App.notifyDate) >= td)) {
            App.notify(App.threshold, App.outputData);
            App.threshold = 0;
            App.notifyDate = nd;
        }
    }
    return true;
};

/**
 * Notify remote using a client connection
 *
 * @param {String} data
 * @return {Bool}
 */
App.notify = function (threshold, data) {
    var client;
    client = null;
    client = net.createConnection(App.options.remotePort,
                                  App.options.remoteHost);
    client.on('error', function(exc){
        if (exc.errno === process.ECONNREFUSED) {
            console.log("Could not connect to notification server",
                        this.remoteAddress, App.options.remotePort);
        }
        return true;
    });
    client.on('connect', function (socket) {
        var out;
        this.setEncoding('utf8');
        if (this.readyState === 'open') {
            out = App.getNotifyData(threshold, data);
            this.write(out);
        }
        this.end();
        return true;
    });
    return true;
};

/**
 * Get notify data to send
 *
 * @param {String} data
 * @return {String}
 */
App.getNotifyData = function (threshold, data) {
    var o, t, a;
    t = (threshold * App.options.cycleTime).toString();
    a = [];
    a.push("put cpu");
    a.push(t);
    a.push(data);
    o = a.join('|');
    return o
};

/**
 * Formats output to client
 *
 * @param {Array} allStats
 * @return {String}
 */
App.output = function (allStats) {
    var o, i, ii, s;
    o = "";
    ii = 0;
    for (i in allStats) {
        if (allStats.hasOwnProperty(i)) {
            s = allStats[i];
            if (ii > 0) {
                o += " ";
            }
            o += s.toFixed(2);
            ii++;
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
App.build = function (data) {
    var d, i, ii, s, fields, thisStat, cpu, cpuIdent, allStats, cpuIndex;
    d = data.split("\n");
    allStats = {};
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
                cpuIndex = parseInt(cpuIdent, 10);
            }
            if (cpuIndex !== null) {
                thisStat = App.getStatRow(cpuIndex, fields);
                allStats[cpuIndex] = thisStat;
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
App.getStatRow = function (cpuIndex, fields) {
    var calc, diffUsage;
    if (App.prevTotal[cpuIndex] === undefined) {
        App.prevTotal[cpuIndex] = 0;
    }
    if (App.prevIdle[cpuIndex] === undefined) {
        App.prevIdle[cpuIndex] = 0;
    }
    calc = App.calculate(fields,
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
 * @param {Array} fields
 * @param {Int} prevIdle
 * @param {Int} prevTotal
 * @return {Array}
 */
App.calculate = function (fields, prevIdle, prevTotal) {
    var idle, total, diffIdle, diffTotal, diffUsage, out;
    idle = fields[3];
    total = fields.reduce(function (p, c) {
        return (parseInt(p, 10) + parseInt(c, 10));
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


