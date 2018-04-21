# Azure IoT Hands-On Guide

This is a guide to the tasks performed during the three IoT sessions at the Global Azure Bootcamp in Burlington, MA, on April 21, 2018. It is intended to be a detailed guide, but should provided highlevel guidance on accomplishing the intended tasks. You may have to rely on Google and your own intuition to fill in the blanks; however, for the various services the descriptions below should include the *non-default* setting values that need to be provided.

## Consume Events from a Device

In this first part of the lab, you will provision your own IoT Hub and device definition and provide the connect string to the instructor. The instructor will add your device to the existing hardware device, which will then begin streaming events to your Iot Hub for consumption. You will also setup and instance of Time Series Analytics to visualize the incoming telemetry.  Lastly, you'll create an Azure storage account to store all of the incoming events, ostensibly as "cold storage" for potential later analytics or machine learning tasks (both of which are out of scope for this lab).

### Provision an IoT Hub instance in the Azure Portal
Create a new Azure IoT Hub (of Basic tier or above - **not the Free Tier**) , it will require a globally unique name, but you can retain all of the default value for the other options. Note that you can create a new Resource Group to house the hub and other resources for this lab in this step.  Following the lab, you can then easily remove all of these services by deleting the encompassing resource group.

Under _DEvice Management_ select the **IoT Devices** blade and add a new device with an ID reflecting your name or so other easily recognizable attribute (to differentiate from other lab participants).  LEave the default option as _Symmetric Key_ and Save. After your device has been created, select it again to bring up the properties, including two keys and two connection string.  Copy one of the connection strings, and e-mail it to the instructor (jim.oneil@outlook.com), so it can be added as an target for the hardware device.

### Provision a Time Series Insights instance
Create a new Azure Time Series Insights environment (instance), place it in the same Resource Group as the IoT Hub before. 

Using the **Event Sources** blade add a new source associated with the IoT Hub you provisioned earlier.  Once you have selected the existing hub, the necessary fields in the setup will be automatically filled, so you do not need to make any separate entries.

Using the **Data Access Policies** blade, add a new user with the Contributor and Reader roles. You will be selecting the user for the Azure Active Directory Tenant associated with your account, so if this is a new or trial subscription the user will likely be the same user used to log in to the portal.

Navigate to Time Series Explorer using the _Time Series Insights Explorer URL_ or the _Go to Environment_ link on the **Overview** blade of you Time Series Insights instance. You should see some event data reported (once your IoT HUb is receiving messages from the hardward device); explore the various filters available.

### Provision an Azure Storage Account
Create a new Azure Storage account (labeled _Storage Acccount - blob, file, table, queue_) in your existing Resource Group.  You will have to provide a unique endpoint name for this storage account.  Select **Blob storage** as the *Account kind*. For the intended use of the storage, the Cool access tier is appropriate; however, for the lab we want to check in to see that the data is being stored, so leave the default _Access tier_ of Hot.

When the service has finished provisioning, select the **Blobs** service in the center of the **Overview** blade. In the resulting blade, add a new Container named _archive_ and set the _Public access level_ to 'Container.' Note, we are doing this for the ease of the lab, and is **not** recommended for a production application. Doing so makes the storage accessible via simple HTTP requests in a browser.

Within the new container named _archive_ upload some file from your local machine, preferably a short text or image file. After the file has been uploaded, select the file name in  **Container** blade to bring up the blob properties blade.  Cpoy the URL of the blob and paste it into a browser. You should see the content of the file that you just uploaded - confirming the _Public access level_ policy.

### Save incoming events to blob storage
Open your IoT Hub instance in the Azure Portal and select the **Endpoints** blade under _Monitoring_. You will have two built-in endpoints _Cloud to device feedback_ and _Events_. Now create a new custom endpoint called _archiveEP_ and select _Azure Storage Container_ as the _Endpoint type_.  Pick the archive container you created in Azure blob storage in a previous step.  You can change the *Batch Frequency* to 60 seconds to minimize the time it will take to see new events within blob storage

Next select the **Routes** blade for your IoT Hub and add a new Route called _archiveRoute_, with a source of _Device Messages_ and an _Endpoint_ of _archiveEP_.  After a minute or so, you should be able to navigate to your blob storage account at __https://{accountName}.blob.core.windows.net/archive?restype=container&comp=list__ and see the list of files create to archive your event. You can copy and paste a specific file (blob) URL to see that the contents of the file are the raw event data in Avro format.

### "Fix" Time Series Insights
Because we've routed all events to blob storage, the events are no longer sent to Time Series Insights, so create a new IoT Hub Route (called _everything_) that accepts all Device Events and routes them back to the built-in _events_ endpoint, which is where Time Series Insights expect to access its data. (IoT Hub will match and send events to every route it matches; however, if it does match a route it does not, by default, send that same message back to the built-in _events_ endpoint.)

## Process Device Events in the Cloud

### Create a Service Bus Instance and Queue
Service Bus queues and topics are often used in cloud architectures to queue up work items for further process. You'll use a queue here to process alert conditions that arrive at IoT Hub. In the Azure Portal, provision a new Service Bus instance in the same Resource Group you've been using.

After the Service Bus has been provisioned, add a new Queue named _alerts_.  Leave the various properties at their defaults and specifically do **not** enable duplicate detection or sessions, since those will not be compatible with your use of this queue.

### Add a IoT Hub Route to the Queue
In your IoT Hub instance, add a new _Endpoint_ called _alertsEP_ that references the Service Bus Queue just created.

Now create a new route called _alertsRoute_ that uses _Device Events_ as the _Data Source_ and your new Service Bus queue (_alertsEP_) as the _Endpoint_.

In previous routes, the _Query String_ was left blank, indicating all events would be processed on a given route. Here, you want to forward only those events where the temperature is out of range. That condition is captureed in a header of the messages sent from the device. The header name is _temperatureAlert_ and it has a value of 'true' or 'false' (as a string). So the _Query string_ needed here is *temperatureAlert = 'true'*

You can see if alert messages are reaching your queue by selecting the queue in the Service Bus **Overview** blade and it should bring up a graphical view of the queue including an _Active Message Count_ that reflects the number of alert messages received.

### Build a Local Notification Endpoint Service
This part of the experience is a little contrived to reduce complexity. In a production scenario, you would use notification technologies like SignalR or Notification Hubs to inform clients about alert conditions. Here you will run a small Node.js server that exposes an endpoint triggered whenever an alert message hits your Service Bus queue.

1. If you do not have Node for Windows installed, do so from [nodejs.org](https://nodejs.org/en/download/) using the Windows Installer .msi option corresponding to your OS bitness.
1. On your local machine create a directory of your own choosing.
2. Create a file in that directory called index.js and the following contents:

```javascript
// load env variables
require('dotenv-extended').load();

const restify = require('restify');

// setup our web server
const server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3939, () => {
    console.log('%s listening to %s', server.name, server.url);
});

server.use(restify.bodyParser({ mapParams: false }));

server.get('/ping', (req, res) => {
	console.log('Ping received');
	res.send(200, 'I am alive');
});

server.post('/alerts', (req, res) => {
	console.log('*** ALERT: It\'s getting too hot ' + req.body.temperature + ' C ***');
	res.send(204);
});
```

3. Create file called package.json
