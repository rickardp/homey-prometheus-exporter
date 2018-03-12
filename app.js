'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('athom-api');
const client = require('prom-client');
const express = require('express');
const server = express();

const gauge_boot_time = new client.Gauge({ name: 'homey_boot_time', help: 'Time of last Homey reboot', labelNames: ["version"] });
const gauge_app_start_time = new client.Gauge({ name: 'homey_app_start_time', help: 'Time of last expoter app start' });
const gauge_memory_total = new client.Gauge({ name: 'homey_memory_total', help: 'Total memory' });
const gauge_memory_free = new client.Gauge({ name: 'homey_memory_free', help: 'Free memory' });
const gauge_memory_swap = new client.Gauge({ name: 'homey_memory_swap', help: 'Swap memory' });
const gauge_memory_used = new client.Gauge({ name: 'homey_memory_used', help: 'Used memory per component', labelNames: ["component"] });
const gauge_storage_total = new client.Gauge({ name: 'homey_storage_total', help: 'Total storage' });
const gauge_storage_free = new client.Gauge({ name: 'homey_storage_free', help: 'Free storage' });
const gauge_cpu_speed = new client.Gauge({ name: 'homey_cpu_speed', help: 'Speed of CPU' });
const gauge_load_average_1 = new client.Gauge({ name: 'homey_load_average_1', help: 'Load average (1 minute)' });
const gauge_load_average_5 = new client.Gauge({ name: 'homey_load_average_5', help: 'Load average (5 minutes)' });
const gauge_load_average_15 = new client.Gauge({ name: 'homey_load_average_15', help: 'Load average (15 minutes)' });
let gauge_device = {}
let device_labels = {}

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
		allDevices = await api.devices.getDevices();
		return allDevices;
	  }

    async onInit() {
        let api = await this.getApi();
        let systeminfo = await api.system.getInfo();

        const appStartTime = Date.parse(systeminfo.date);
        const bootTime = appStartTime - 1000 * systeminfo.uptime;

        gauge_app_start_time.set(appStartTime)
        gauge_boot_time.labels(systeminfo.homey_version).set(bootTime)

        await this.updateSystemInfo();
        await this.updateDeviceList();

		// Adding notifiers
		console.log("Subscribing to device changes")
		await api.devices.subscribe();
        api.devices.on('device.create', id => {
            console.log('Adding new device ' + id)
            this.updateDeviceList();
        });
        api.devices.on('device.update', id => {
            console.log('Updating device ' + id)
            this.updateDeviceList();
        });
        //boot = new Date(Date.parse(x.date) - x.uptime * 1000)
        //let allDevices = await api.devices.getDevices();
        //console.log(systeminfo);

	let respond = function(request, response) {
            response.contentType("text/plain; charset=utf-8");
            response.end(client.register.metrics());
        };

        server.get("/metrics", respond);
        server.get("/prometheus/metrics", respond);
        server.listen(9414);
    }

    async updateDeviceList() {
        this.log('Update device list');
        let api = await this.getApi();
    	let zones = await api.zones.getZones();
    	let devices = await api.devices.getDevices();

    	for(let devId in devices) {
    		this.registerDevice(devId, devices[devId], zones);
    	}
    }

    registerDevice(devId, dev, zones) {
        console.log("Registering device " + devId);
        dev.on('$state', (state, capability) => {
            for(let st in state) {
                this.reportState(devId, st, state[st]);
            }
        });
        var labels = getZoneLabels(dev.zone.id, zones);
        labels.device = devId;
        labels.name = dev.name;
        if(!(devId in device_labels)) {
            // Report initial state
            device_labels[devId] = labels; // Need to do this before reportState
            let s = dev.state;
            for(let sn in s) {
                this.reportState(devId, sn, s[sn]);
            }
        } else {
            device_labels[devId] = labels; // Update labels in case device was renamed/moved
        }
    }

    reportState(devId, statename, value) {
    	if(value === null || value === undefined) return;

        // Convert type
        if(typeof value === 'boolean')
        	value = value ? 1 : 0;
        else if(typeof value === 'string')
        	return; // Strings are not yet mapped

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
        //this.log('Update system info');
        let api = await this.getApi();
        let systeminfo = await api.system.getInfo();

        gauge_memory_total.set(systeminfo.totalmem);
        gauge_memory_free.set(systeminfo.freemem);

        gauge_load_average_1.set(systeminfo.loadavg[0]);
        gauge_load_average_5.set(systeminfo.loadavg[1]);
        gauge_load_average_15.set(systeminfo.loadavg[2]);

        gauge_cpu_speed.set(systeminfo.cpus[0].speed);

        let storageInfo = await api.system.getStorageStats();
        gauge_storage_total.set(storageInfo.total);
        gauge_storage_free.set(storageInfo.free);

        let memoryInfo = await api.system.getMemoryStats();
        gauge_memory_swap.set(memoryInfo.swap);
        for(let app in memoryInfo.types) {
            gauge_memory_used.labels(app).set(memoryInfo.types[app].size);
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
