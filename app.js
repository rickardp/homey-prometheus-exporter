'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('athom-api');
const client = require('prom-client');
const express = require('express');
const server = express();

const gauge_boot_time = new client.Gauge({ name: 'homey_boot_time', help: 'Time of last Homey reboot', labelNames: ["version"] });
const gauge_app_start_time = new client.Gauge({ name: 'homey_app_start_time', help: 'Time of last exporter app start' });
const gauge_memory_total = new client.Gauge({ name: 'homey_memory_total', help: 'Total memory' });
const gauge_memory_free = new client.Gauge({ name: 'homey_memory_free', help: 'Free memory' });
const gauge_memory_swap = new client.Gauge({ name: 'homey_memory_swap', help: 'Swap memory' });
const gauge_memory_used = new client.Gauge({ name: 'homey_memory_used', help: 'Used memory per component', labelNames: ["component"] });
const gauge_storage_total = new client.Gauge({ name: 'homey_storage_total', help: 'Total storage' });
const gauge_storage_free = new client.Gauge({ name: 'homey_storage_free', help: 'Free storage' });
const gauge_storage_used = new client.Gauge({ name: 'homey_storage_used', help: 'Used storage per component', labelNames: ["component"] });
const gauge_cpu_speed = new client.Gauge({ name: 'homey_cpu_speed', help: 'Speed of CPU' });
const gauge_cpu = new client.Gauge({ name: 'homey_cpu', help: "CPU time per mode", labelNames: ["mode"] });
const gauge_load_average_1 = new client.Gauge({ name: 'homey_load_average_1', help: 'Load average (1 minute)' });
const gauge_load_average_5 = new client.Gauge({ name: 'homey_load_average_5', help: 'Load average (5 minutes)' });
const gauge_load_average_15 = new client.Gauge({ name: 'homey_load_average_15', help: 'Load average (15 minutes)' });
const gauge_tx_total = new client.Gauge({ name: 'homey_tx_total', help: 'Total sent packets', labelNames: ['node', 'device', 'name', 'zone', 'zones'] });
const gauge_tx_error = new client.Gauge({ name: 'homey_tx_error', help: 'Failed sent packets', labelNames: ['node', 'device', 'name', 'zone', 'zones'] });
const gauge_rx_total = new client.Gauge({ name: 'homey_rx_total', help: 'Total received packets', labelNames: ['node', 'device', 'name', 'zone', 'zones'] });
const gauge_present = new client.Gauge({ name: 'homey_user_present', help: 'User is at home', labelNames: ['email'] });
const gauge_asleep = new client.Gauge({ name: 'homey_user_asleep', help: 'User is at asleep', labelNames: ['email'] });
let gauge_device = {}
var device_labels = {}
let zwave_devices = {}
let user_map = {}
var device_cap_insts = {}
var deviceListNeedsUpdate = false;

// Uncomment the line above to enable the inspector (to use Chrome as a debugger)
// (execution will stop until a debugger is attached)
//require('inspector').open(9229, '0.0.0.0', true);

class PrometheusApp extends Homey.App {
    getApi() {
        if (!this.api) {
            this.api = HomeyAPI.forCurrentHomey();
        }
        return this.api;
    }

    async getDevices() {
		const api = await this.getApi();
		let allDevices = await api.devices.getDevices();
		return allDevices;
	  }

    async onInit() {
        let api = await this.getApi();
        let systemInfo = await api.system.getInfo();

        const appStartTime = Date.parse(systemInfo.date);
        const bootTime = appStartTime - 1000 * systemInfo.uptime;

        gauge_app_start_time.set(appStartTime)
        gauge_boot_time.labels(systemInfo.homeyVersion).set(bootTime)

        deviceListNeedsUpdate = true;
        await this.updateDeviceList();
        await this.updateSystemInfo();

		// Adding notifiers
		console.log("Subscribing to device changes")
        api.devices.on('device.create', id => {
            console.log('Adding new device ' + id)
            deviceListNeedsUpdate = true;
            setTimeout(this.updateDeviceList.bind(this), 1000);
        });
        api.devices.on('device.update', id => {
            console.log('Updating device ' + id)
            deviceListNeedsUpdate = true;
            setTimeout(this.updateDeviceList.bind(this), 1000);
        });
        api.devices.on('device.delete', id => {
            console.log('Deleting device ' + id)
            deviceListNeedsUpdate = true;
            setTimeout(this.updateDeviceList.bind(this), 1000);
        });

        console.log("Updating user map");
        let users = await api.users.getUsers();
        let updatePresence = this.updatePresence;
        for(let uid in users) {
            console.log("User " + uid + " is " + users[uid].email);
            user_map[uid] = users[uid].email;
            users[uid].on('$update', function(self) {
                console.log("User " + self.email + "changed, updating presence");
                updatePresence(users);
            });
        }
        updatePresence(users);

	    let respond = function(request, response) {
            response.contentType("text/plain; charset=utf-8");
            response.end(client.register.metrics());
        };

        server.get("/metrics", respond);
        server.get("/prometheus/metrics", respond);
        server.listen(9414);
    }

    async updatePresence(users) {
        for(let uid in user_map) {
            let present = users[uid].present;
            let asleep = users[uid].asleep;
            console.log("User " + users[uid].email + ": present " + present + " asleep " + asleep);
            gauge_present.labels(users[uid].email).set(present ? 1 : 0)
            gauge_asleep.labels(users[uid].email).set(asleep ? 1 : 0)
        }
    }

    async updateDeviceList() {
        if(!deviceListNeedsUpdate) return;
        deviceListNeedsUpdate = false;
        this.log('Update device list');
        let api = await this.getApi();
    	let zones = await api.zones.getZones();
        let devices = await api.devices.getDevices();
        
        device_labels = {}
        for(let key in gauge_device) {
            gauge_device[key].reset();
        }
        for(let devId in device_cap_insts) {
            for(let capInst of device_cap_insts[devId]) {
                capInst.destroy();
            }
        }
        device_cap_insts = {}

    	for(let devId in devices) {
    		this.registerDevice(devId, devices[devId], zones);
    	}
    }

    registerDevice(devId, dev, zones) {
        console.log("Registering device " + devId);
        var labels = getZoneLabels(dev.zone, zones);
        labels.device = devId;
        labels.name = dev.name;
        if(!(devId in device_labels)) {
            // Report initial state
            device_labels[devId] = labels; // Need to do this before reportState
            let s = dev.capabilities;
            let capInsts = []
            for(let sn of s) {
                if(!dev.capabilitiesObj) continue;
                if(!dev.capabilitiesObj[sn]) continue;
                let capId = dev.capabilitiesObj[sn].id;
                if(!capId) continue;
                var capInst = null;
                let self = this;
                function onCapChg(val) {
                    if(val) {
                        //console.log(" dev cap " + dev.name + " "+ sn + " is " + val);
                        self.reportState(devId, sn, val);
                    }
                }
                capInst = dev.makeCapabilityInstance(capId, onCapChg);
                // Report initial state
                capInsts.push(capInst);
                onCapChg(capInst.value);
            }
            device_cap_insts[devId] = capInsts; // Register so that we can dispose when device renamed/moved
        } else {
            device_labels[devId] = labels; // Update labels in case device was renamed/moved
        }
        if(dev.flags.includes("zwave")) {
            let zwaveId = dev.settings.zw_node_id;
            if(zwaveId) {
                console.log("Device " + dev.name + " has zwave node id " + zwaveId);
                zwave_devices[zwaveId] = devId
            }
        }
    }

    reportState(devId, statename, value) {
    	if(value === null || value === undefined) return;

        // Convert type
        if(typeof value === 'boolean')
        	value = value ? 1 : 0;
        else if(typeof value === 'string')
        	return; // Strings are not yet mapped

        // Make sure state names are valid (e.g. remove dots in names)
        statename = statename.replace(/[^A-Za-z0-9_]/g, '_');

        console.log("State changed for " + devId + ", " + statename);
        let key = "homey_device_" + statename;
        if(!(key in gauge_device)) {
        	gauge_device[key] = new client.Gauge({ name: 'homey_device_' + statename, help: 'State ' + statename, labelNames: ['device', 'name', 'zone', 'zones'] });
        }
        let labels = device_labels[devId]
        if(!labels) {
            console.log("Cannot report unknown device " + devId);
        } else {
            gauge_device[key].labels(labels.device, labels.name, labels.zone, labels.zones).set(value);
        }
    }

    async updateSystemInfo() {
        let api = await this.getApi();
        let systemInfo = await api.system.getInfo();

        gauge_load_average_1.set(systemInfo.loadavg[0]);
        gauge_load_average_5.set(systemInfo.loadavg[1]);
        gauge_load_average_15.set(systemInfo.loadavg[2]);

        gauge_cpu_speed.set(systemInfo.cpus[0].speed);
        for(let time in systemInfo.cpus[0].times) {
          gauge_cpu.labels(time).set(systemInfo.cpus[0].times[time]);
        }

        let storageInfo = await api.system.getStorageInfo();
        gauge_storage_total.set(storageInfo.total);
        gauge_storage_free.set(storageInfo.free);
        for(let app in storageInfo.types) {
            gauge_storage_used.labels(app).set(storageInfo.types[app].size);
        }

        let memoryInfo = await api.system.getMemoryInfo();
        gauge_memory_total.set(memoryInfo.total);
        gauge_memory_free.set(memoryInfo.free);
        gauge_memory_swap.set(memoryInfo.swap);
        for(let app in memoryInfo.types) {
            gauge_memory_used.labels(app).set(memoryInfo.types[app].size);
        }

        if(Object.keys(zwave_devices).length > 0) {
            let zwave = await api.zwave.getState();
            if(zwave && zwave.zw_state && zwave.zw_state.stats) {
                //console.log(zwave)
                console.log("Checking z-wave status")
                for(let zwn in zwave_devices) {
                    let net = zwave.zw_state.stats['node_' + zwn + '_network'];
                    let labels = device_labels[zwave_devices[zwn]];
                    if(net && labels) {
                        gauge_tx_total.labels(zwn, labels.device, labels.name, labels.zone, labels.zones).set(net.tx);
                        gauge_tx_error.labels(zwn, labels.device, labels.name, labels.zone, labels.zones).set(net.tx_err);
                        gauge_rx_total.labels(zwn, labels.device, labels.name, labels.zone, labels.zones).set(net.rx);
                    }
                }
            }
        }
        
        setTimeout(this.updateSystemInfo.bind(this), 30000);
    }
}

function getZoneLabels(zoneId, zones) {
    let zone = zones[zoneId];
    if (!zone) return {}
    if (!zone.parent) {
        let ret = {}
        ret.home = ret.zone = ret.zones = zone.name
        return ret
    } else {
        let ret = getZoneLabels(zone.parent, zones)
        ret.zone = zone.name
        ret.zones += '/' + ret.zone.replace('/',' ')
        return ret
    }
}


function transformName(name) {
    return name.toLowerCase().normalize("NFD").replace(/[ -]+/g, "_").replace(/[^a-z0-9_]/g, "")
}

module.exports = PrometheusApp;
