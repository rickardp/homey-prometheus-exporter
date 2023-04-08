import { HomeyAPI } from 'athom-api';
import client, { Gauge } from 'prom-client';
import PrometheusMetrics from '../metrics';
import MetricSource from './source';
import Profiling from '../../profiling';

export default class DevicesSource implements MetricSource {
  api: HomeyAPI = null as unknown as HomeyAPI;
  metrics: PrometheusMetrics = null as unknown as PrometheusMetrics;
  profiling: Profiling = null as unknown as Profiling;
  deviceListNeedsUpdate = true;
  deviceCaps: { [key: string]: any } = {};
  readonly deviceMetricGauges: { [key: string]: Gauge } = {};
  readonly cleanedMetricNames: { [key: string]: string } = {};
  readonly zwaveDevicesByZwaveId: { [key: string]: string } = {};
  readonly zigbeeDevicesByZigbeeId: { [key: string]: string } = {};
  readonly onlineDevices: { [key: string]: number | null } = {};

  initialize = async (api: HomeyAPI, metrics: PrometheusMetrics, profiling: Profiling) => {
    this.api = api;
    this.metrics = metrics;
    this.profiling = profiling;
    await this.updateDeviceList();
    // Adding notifiers
    console.log('Subscribing to device changes');
    (api.devices as any).on('device.create', (dev: HomeyAPI.ManagerDevices.Device) => {
      console.log(`Adding new device ${dev.id} with name ${dev.name} driver ${dev.driverId}`);
      this.deviceListNeedsUpdate = true;
      setTimeout(() => this.updateDeviceList(), 1000);
    });
    (api.devices as any).on('device.update', (dev: HomeyAPI.ManagerDevices.Device) => {
      console.log(`Updating device ${dev.id} with name ${dev.name} driver ${dev.driverId}`);
      this.deviceListNeedsUpdate = true;
      setTimeout(() => this.updateDeviceList(), 10000);
    });
    (api.devices as any).on('device.delete', (dev: HomeyAPI.ManagerDevices.Device) => {
      console.log(`Deleting device ${dev.id} with name ${dev.name} driver ${dev.driverId}`);
      this.deviceListNeedsUpdate = true;
      setTimeout(() => this.updateDeviceList(), 1000);
    });
    (api.zwave as any).on('state', (zwave: any) => this.zwaveStateChange(zwave));
    (api.zigBee as any).on('state', (zigbee: any) => this.zigbeeStateChange(zigbee));
  };

  stop = async () => {};

  updateDeviceList = async () => {
    await this.profiling.timeAsyncCode(async () => {
      if (!this.deviceListNeedsUpdate) return;
      this.deviceListNeedsUpdate = false;
      console.log('Update device list');
      const zones = await this.api.zones.getZones();
      const devices = await this.api.devices.getDevices();

      this.metrics.deviceLabels = {};
      for (const gauge of Object.values(this.deviceMetricGauges)) {
        gauge.reset();
      }
      for (const devCaps of Object.values(this.deviceCaps)) {
        for (const capInst of devCaps) {
          capInst.destroy();
        }
      }
      this.deviceCaps = {};

      for (const devId of Object.keys(devices)) {
        this.registerDevice(devId, devices[devId], zones);
      }
    }, 'updatedevicelist');
  };

  getDevices = async () => {
    const allDevices = await this.api.devices.getDevices();
    return allDevices;
  };

  registerDevice = (
    devId: string,
    dev: HomeyAPI.ManagerDevices.Device,
    zones: { [key: string]: HomeyAPI.ManagerZones.Zone },
  ) => {
    this.profiling.timeCode(
      () => {
        console.log(`Registering device ${devId}`);
        const labels = this.getZoneLabels(dev.zone, zones);
        labels.device = devId;
        labels.name = dev.name;
        labels.class = dev.class ? dev.class : 'unknown';
        labels.driver = dev.driverUri ? dev.driverUri : 'unknown';
        labels.driver_id = dev.driverId ? dev.driverId : 'unknown';
        console.log(dev);
        if (!(devId in this.metrics.deviceLabels)) {
          // Report initial state
          this.metrics.deviceLabels[devId] = labels; // Need to do this before reportState
          const s = dev.capabilities;
          const capInsts: HomeyAPI.ManagerDevices.Device.CapabilityInstance[] = [];
          for (const sn of s) {
            if (!dev.capabilitiesObj) continue;
            if (!dev.capabilitiesObj[sn]) continue;
            const capId = (dev.capabilitiesObj[sn] as any).id;
            if (!capId) continue;
            (dev as any).setMaxListeners(1000); // Silence incorrect memory leak warning if we listen to many devices
            const capInst = dev.makeCapabilityInstance(capId, (val: any) =>
              this.onCapChg(devId, sn, val),
            ) as HomeyAPI.ManagerDevices.Device.CapabilityInstance;
            // Report initial state
            capInsts.push(capInst);
            this.onCapChg(devId, sn, capInst.value);
          }
          this.deviceCaps[devId] = capInsts; // Register so that we can dispose when device renamed/moved
        } else {
          this.metrics.deviceLabels[devId] = labels; // Update labels in case device was renamed/moved
        }
        if (dev.flags.includes('zwave')) {
          const zwaveId = dev.settings.zw_node_id;
          if (zwaveId) {
            console.log(`Device ${dev.name} has Z-Wave node id ${zwaveId}`);
            this.zwaveDevicesByZwaveId[zwaveId] = devId;
          }
        }
        if (dev.flags.includes('zigbee')) {
          const zigbeeId = dev.settings.zb_device_id;
          if (zigbeeId) {
            console.log(`Device ${dev.name} has ZigBee device id ${zigbeeId}`);
            this.zigbeeDevicesByZigbeeId[zigbeeId] = devId;
          }
        }
      },
      'registerdevice',
      { device: devId },
    );
  };

  onCapChg = (devId: string, sn: string, val: any) => {
    if (val !== null && val !== undefined) {
      // console.log(" dev cap " + dev.name + " "+ sn + " is " + val);
      this.reportState(devId, sn, val);
    }
  };

  reportState = (devId: string, statename: string, value: any) => {
    this.profiling.timeCode(
      () => {
        if (value === null || value === undefined) return;

        // Convert type
        if (typeof value === 'boolean') value = value ? 1 : 0;
        else if (typeof value === 'string') return; // Strings are not yet mapped

        // Make sure state names are valid (e.g. remove dots in names)

        // console.log("State changed for " + devId + ", " + statename);
        if (!(statename in this.deviceMetricGauges)) {
          let cleanedState = statename.replace(/[^A-Za-z0-9_]/g, '_');
          while (cleanedState in this.cleanedMetricNames) {
            cleanedState += '_';
          }
          this.cleanedMetricNames[cleanedState] = statename;
          const key = `homey_device_${cleanedState}`;
          this.deviceMetricGauges[statename] = new client.Gauge({
            name: key,
            help: `State ${statename}`,
            labelNames: ['device', 'name', 'zone', 'zones', 'class', 'driver', 'driver_id'],
          });
        }
        const labels = this.metrics.deviceLabels[devId];
        if (!labels) {
          console.log(`Cannot report unknown device ${devId}`);
        } else {
          this.deviceMetricGauges[statename]
            .labels(
              labels.device,
              labels.name,
              labels.zone,
              labels.zones,
              labels.class,
              labels.driver,
              labels.driver_id,
            )
            .set(value);
        }
      },
      'deviceupdate',
      { device: devId },
    );
  };

  zwaveStateChange = (zwave: any) => {
    this.profiling.timeCode(() => {
      if (zwave && zwave.zw_state && zwave.zw_state.stats && Object.keys(this.zwaveDevicesByZwaveId).length > 0) {
        const ts = zwave.$lastUpdated * 1e-3;
        if (!ts) return;
        for (const zwn of Object.keys(this.zwaveDevicesByZwaveId)) {
          const net = zwave.zw_state.stats[`node_${zwn}_network`];
          const labels = this.metrics.deviceLabels[this.zwaveDevicesByZwaveId[zwn]];
          if (!labels) continue;

          if (net) {
            this.metrics.gauge_tx_total.labels(zwn, labels.device, labels.name, labels.zone, labels.zones).set(net.tx);
            this.metrics.gauge_tx_error
              .labels(zwn, labels.device, labels.name, labels.zone, labels.zones)
              .set(net.tx_err);
            this.metrics.gauge_rx_total.labels(zwn, labels.device, labels.name, labels.zone, labels.zones).set(net.rx);
          }
          let online = zwave.zw_state.stats[`node_${zwn}_online`];
          if (online === undefined) online = true;

          let timeOnline = 0.0;
          const prevOnline = this.onlineDevices[this.zwaveDevicesByZwaveId[zwn]];
          if (prevOnline) {
            timeOnline = ts - prevOnline;
          }

          if (online) {
            this.onlineDevices[this.zwaveDevicesByZwaveId[zwn]] = ts;
            if (prevOnline === null) {
              this.metrics.counter_online_count
                .labels(zwn, labels.device, labels.name, labels.zone, labels.zones)
                .inc();
            }
          } else {
            this.onlineDevices[this.zwaveDevicesByZwaveId[zwn]] = null;
          }
          if (timeOnline > 0) {
            this.metrics.counter_online_time
              .labels(zwn, labels.device, labels.name, labels.zone, labels.zones)
              .inc(timeOnline);
          }
        }
      }
    }, 'zwave');
  };

  zigbeeStateChange(zigbee: any) {
    this.profiling.timeCode(() => {
      if (
        zigbee &&
        zigbee.zigbee_state &&
        zigbee.zigbee_state.devices &&
        Object.keys(this.zigbeeDevicesByZigbeeId).length > 0
      ) {
        const ts = zigbee.$lastUpdated * 1e-3;
        if (!ts) return;
        for (const node of zigbee.zigbee_state.devices) {
          if (!node.deviceId) continue;
          const zbd = this.zigbeeDevicesByZigbeeId[node.deviceId];
          if (!zbd) continue;

          const labels = this.metrics.deviceLabels[zbd];
          if (!labels) continue;

          const online = node.status !== 'offline';

          let timeOnline = 0.0;
          const prevOnline = this.onlineDevices[zbd];
          if (prevOnline) {
            timeOnline = ts - prevOnline;
          }

          if (online) {
            this.onlineDevices[zbd] = ts;
            if (prevOnline === null) {
              this.metrics.counter_online_count
                .labels(node.deviceId, labels.device, labels.name, labels.zone, labels.zones)
                .inc();
            }
          } else {
            this.onlineDevices[zbd] = null;
          }
          if (timeOnline > 0) {
            this.metrics.counter_online_time
              .labels(node.deviceId, labels.device, labels.name, labels.zone, labels.zones)
              .inc(timeOnline);
          }
        }
      }
    }, 'zigbee');
  }

  getZoneLabels = (zoneId: string, zones: { [key: string]: HomeyAPI.ManagerZones.Zone }): { [key: string]: string } => {
    const zone = zones[zoneId];
    if (!zone) return {};
    if (!zone.parent) {
      const ret = {} as any;
      ret.home = ret.zone = ret.zones = zone.name;
      return ret;
    }
    const ret = this.getZoneLabels(zone.parent, zones);
    ret.zone = zone.name;
    ret.zones += `/${ret.zone.replace('/', ' ')}`;
    return ret;
  };
}
