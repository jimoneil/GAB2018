'use strict';

const fs = require('fs');
const path = require('path');

const Client = require('azure-iot-device').Client;
const ConnectionString = require('azure-iot-device').ConnectionString;
const Message = require('azure-iot-device').Message;
const Protocol = require('azure-iot-device-mqtt').Mqtt;

// Edison packages
const five = require("johnny-five");
const Edison = require("edison-io");
const board = new five.Board({
  io: new Edison()
});

const MessageProcessor = require('./messageProcessor.js');

var sendingMessage = false;
var messageId = 0;
var config, messageProcessor;
var clients = [];
var connectionStrings = [  
"HostName=gabiot2.azure-devices.net;DeviceId=MyDevice;SharedAccessKey=vaZArxFWF259jC+xxIXbec5ZnREzuhAkyOUbzpta4wQ="
];

(function () {
  
  try {
    config = require('./config.json');
  } catch (err) {
    console.error('Failed to load config.json: ' + err.message);
    return;
  }

  board.on('ready', () => {
    config.led = new five.Led(config.LEDPin);
    messageProcessor = new MessageProcessor(config);
    sendingMessage = true;
  });

  connectionStrings.forEach( v => {
    var c = Client.fromConnectionString(v, Protocol);
    clients.push(c)

    c.deviceId = ConnectionString.parse(v).DeviceId;
    c.sendMessage = function() { 
      if (!sendingMessage) return;

      messageId++;
      messageProcessor.getMessage(messageId, this.deviceId, (content, temperatureAlert) => {

        var message = new Message(content);
        message.properties.add('temperatureAlert', temperatureAlert ? 'true' : 'false');
        
        console.log(this.deviceId + ': ' + (temperatureAlert ? '! ' : '  ') + content);
        this.sendEvent(message, (err) => {
          if (err) {
            console.error(this.deviceId + ' send FAILED.');
          } else {
            config.led.blink();
          }
        });

        setTimeout(this.sendMessage.bind(this), config.interval); 
      })
    }

    c.open(err => {
      if (err) {
        console.error(this.deviceId + ' connect failed: ' + err.message);
        return;
      }
      c.sendMessage();
    });
  });
})();
