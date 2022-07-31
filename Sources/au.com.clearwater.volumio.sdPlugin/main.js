#! /usr/local/bin/node

var WS = require('ws');
var io=require('socket.io-client');  // IMPORTANT: old version of socket.io  "socket.io-client": "^1.7.4"
var jimp=require('jimp');
var resolveRelative = require('resolve-relative-url');

var { exec } = require('child_process');
const { defaultMaxListeners } = require('events');
var myArgs = process.argv.slice(2);
var port = myArgs[1];
var uuid = myArgs[3];
var registerEvent = myArgs[5];
var ws;
var wsClient;
var debug = false;
var logging = true;
const timers = {}

if (logging) {
    var fs = require('fs');
    var util = require('util');
    var logFile = fs.createWriteStream('/tmp/streamdeck-volumio.log', {flags : 'w'});
    var logStdout = process.stdout;
    console.log = function () {
        logFile.write(util.format.apply(null, arguments) + '\n');
        logStdout.write(util.format.apply(null, arguments) + '\n');
    }
    console.error = console.log;
}

const actions = {
    VOLUME_DOWN: 'au.com.clearwater.volumio.volumedown',
    VOLUME_UP: 'au.com.clearwater.volumio.volumeup',
    PLAY_PAUSE: 'au.com.clearwater.volumio.playpause',
}

const contexts = {
    VOLUME_DOWN: undefined,
    VOLUME_UP: undefined,
    PLAY_PAUSE: undefined,
}

if (debug) {
    class MockWS {
        on(action, fn) {
            this[action] = fn;
        }

        send(message) {
            console.log("SENT:", message);
        }
    };
    ws = new MockWS();
} else {
    console.log('streamdeck ws port:', port);
    ws = new WS('ws://127.0.0.1:' + port);
}

var DestinationEnum = Object.freeze({
    HARDWARE_AND_SOFTWARE: 0,
    HARDWARE_ONLY: 1,
    SOFTWARE_ONLY: 2
});
var volumioHostName = undefined; // eg "Nuonic VPN"
var volumioState = undefined;
var volumioAlbumArt = undefined;

function showAlert(context) {
    var json = {
        event: 'showAlert',
        context: context,
    }
    ws.send(JSON.stringify(json));
}

function setState(context, state) {
    vpnStatus = state;
    var json = {
        event: 'setState',
        context: context,
        payload: {
            target: DestinationEnum.HARDWARE_AND_SOFTWARE,
            state: state,
        }
    };
    console.log("setting state ", json);
    ws.send(JSON.stringify(json));
}

function clearVolume(context) {
    console.log('timer fired', context);
    if (context) {
        var json = {
            event: 'setTitle',
            context: context,
            payload: {
                title: '',
                target: DestinationEnum.HARDWARE_AND_SOFTWARE,
            }
        };
        console.log("clearing volume ", json);
        ws.send(JSON.stringify(json));
    }
}

function showVolume(context, volume) {
    if (timers[context]) {
        clearTimeout(timers[context]);
    }
    timers[context] = setTimeout(() => clearVolume(context), 2000);
    console.log("showVolume", context, volume);
    if (context) {
        var json = {
            event: 'setTitle',
            context: context,
            payload: {
                title: `${volume} %`,
                target: DestinationEnum.HARDWARE_AND_SOFTWARE,
    //            state: 0,
            }
        };
        console.log("showing volume ", json);
        ws.send(JSON.stringify(json));
    }
}

function showPlayPause() {
    const state = volumioState?.status === 'play' ? 1 : 0;
    console.log(volumioState?.status, 'changing state to', state);
    if (contexts.PLAY_PAUSE) {
        var json = {
            event: 'setState',
            context: contexts.PLAY_PAUSE,
            payload: {
                target: DestinationEnum.HARDWARE_AND_SOFTWARE,
                state: state,
            }
        };
        console.log("setting state ", json);
        ws.send(JSON.stringify(json));
    } else {
        console.log('no playpause context');
    }
}

function showImage(context, image) {
    if (context) {
        var json = {
            event: 'setImage',
            context: context,
            payload: {
                image: image,
                target: DestinationEnum.HARDWARE_AND_SOFTWARE,
                state: 1,
            }
        };
        console.log("setting image ", json);
        ws.send(JSON.stringify(json));
    }
}

function setVolume(volume) {
    console.log('setting volume', volume);
    console.log('emit volume', volume);
    wsClient.emit('volume', volume);
}

function setPlay() {
    console.log('emit play');
    wsClient.emit('play');
}

function setStop() {
    console.log('emit stop');
    wsClient.emit('stop');
}

function updateImage(context, url) {
    const absUrl = resolveRelative(url, `http://${volumioHostName}`);
    console.log('fetching', url, 'from', absUrl);
    jimp.read(absUrl, function(err, img) {
        if (err) {
            console.log('failed to fetch ', url);
            console.log(err);
        } else {
            img.resize(72, 72).getBase64(jimp.AUTO, function(err, img64) {
                if (err) {
                    console.log('failed to resize image', url);
                    console.log(err);
                } else {
                    showImage(context, img64);
                    volumioAlbumArt = url;
                }
            });
        }
    });
}

function monitorStart() {
    console.log('monitorStart');
    monitorStop();
    if (volumioHostName === undefined || volumioHostName === "") {
        console.log('no host name');
        monitorStop();
        return;
    }
    console.log('connecting');
    const url = `http://${volumioHostName}`;
    console.log(url);
    wsClient = io.connect(url);
    console.log({'wsClient': wsClient});
    wsClient.on('connect', function () {
        console.log('Client Connected');
        wsClient.emit('getState');
    });

    wsClient.on('disconnect', function () {
        console.log('Client Disconnected');
    });

    wsClient.on('pushState', function message(data) {
        console.log('received: %s', data);
        if (data.volume !== volumioState?.volume) {
            showVolume(contexts.VOLUME_UP, data.volume);
            showVolume(contexts.VOLUME_DOWN, data.volume);
            //showVolume(contexts.PLAY_PAUSE, data.volume);
        }
        if (data.albumart !== volumioAlbumArt) {
            updateImage(contexts.PLAY_PAUSE, data.albumart);
        }
        volumioState = data;

        showPlayPause();
    });

}

function monitorStop() {
    if (wsClient) {
        //wsClient.terminate();
        //wsClient = undefined;
    }
}

function setSettings(context) {
    var json = {
        "event": "setSettings",
        "context": context,
        "payload": {volumioHostName: volumioHostName},
    };
    console.log('setSettings', json);
    ws.send(JSON.stringify(json));
}

ws.on('open', function () {
    var json = {
        event: registerEvent,
        uuid: uuid
    };
    ws.send(JSON.stringify(json));
});

ws.on('message', function (evt) {
    var jsonObj = JSON.parse(evt);
    console.log('on message', jsonObj);
    if (jsonObj.event) {
        switch (jsonObj.event) {
        case 'keyUp':
            if (volumioState) {
                console.log('volumioState', volumioState);
                switch (jsonObj.action) {
                    case actions.VOLUME_DOWN:
                        setVolume(Math.max(0, volumioState.volume - 5));
                        break;
                    case actions.VOLUME_UP:
                        setVolume(Math.min(100, volumioState.volume + 5))
                        break;
                    case actions.PLAY_PAUSE:
                        if (jsonObj.payload.state == 0) {
                            setPlay();
                        } else if (jsonObj.payload.state == 1) {
                            setStop();
                        }
                        break;
                    default:
                        console.log('unhandled action', jsonObj.action);
                }
            } else {
                console.log('volumio state is not set');
            }
            break;
        case 'willAppear':
            switch (jsonObj.action) {
                case actions.VOLUME_DOWN:
                    contexts.VOLUME_DOWN = jsonObj.context;
                    if (volumioState) {
                        showVolume(contexts.VOLUME_DOWN, volumioState.volume);
                    }
                    break;
                case actions.VOLUME_UP:
                    contexts.VOLUME_UP = jsonObj.context;
                    if (volumioState) {
                        showVolume(contexts.VOLUME_UP, volumioState.volume);
                    }
                    break;
                case actions.PLAY_PAUSE:
                    contexts.PLAY_PAUSE = jsonObj.context;
                    if (volumioAlbumArt) {
                        updateImage(contexts.PLAY_PAUSE, volumioAlbumArt);
                    }
                    break;
                default:
                    console.log("Unknown context ", jsonObj);
            }
            if (jsonObj.payload?.settings.volumioHostName && jsonObj.payload.settings.volumioHostName !== volumioHostName) {
                volumioHostName = jsonObj.payload.settings.volumioHostName;
                monitorStart();
            } else if (!wsClient) {
                monitorStart();
            }
            break;
        // case 'willDisappear':
        //     monitorStop();
        //     break;
        case 'didReceiveSettings':
            volumioHostName = jsonObj.payload.settings.volumioHostName;
            monitorStart();
            break;
        case 'sendToPlugin':
            console.log('sendToPlugin received');
            if (jsonObj.payload?.volumioHostName && jsonObj.payload.volumioHostName !== volumioHostName) {
                volumioHostName = jsonObj.payload.volumioHostName;
                console.log('new service', volumioHostName);
                if (contexts.PLAY_PAUSE) setSettings(contexts.PLAY_PAUSE);
                if (contexts.VOLUME_DOWN) setSettings(contexts.VOLUME_DOWN);
                if (contexts.VOLUME_UP) setSettings(contexts.VOLUME_UP);
                monitorStart();
            }
            break;
        default:
            console.log('unhandled', jsonObj.event);
        }
    }
});

if (debug) {
    ws.open()
    ws.message('{"event": "willAppear", "context": "--context--", "payload": {"settings":{"volumioHostName": "192.168.9.75"}}}');
    ws.message('{"event": "didReceiveSettings", "payload": {"settings":{"volumioHostName": "192.168.9.75"}}}');
    setInterval(ws.message, 5000, '{"event": "keyDown", "action": "au.com.clearwater.volumio.playpause", "context": "--context--"}');
}