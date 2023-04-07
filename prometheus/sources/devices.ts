import { HomeyAPI } from "athom-api";
import PrometheusMetrics from "../metrics";
import MetricSource from "./source";
import Profiling from "../../profiling";
import client from "prom-client";
import { Gauge } from "prom-client";

export default class DevicesSource implements MetricSource {
  api: HomeyAPI = null as unknown as HomeyAPI;
  metrics: PrometheusMetrics = null as unknown as PrometheusMetrics;
  profiling: Profiling = null as unknown as Profiling;
  deviceListNeedsUpdate = true;
  readonly deviceCaps = new Map<string, any>();
  readonly gauge_device = new Map<string, Gauge>();
  readonly gauge_device_cleaned = new Map<string, string>();
  readonly zwave_devices = new Map<string, string>();
  readonly zigbee_devices = new Map<string, string>();
  readonly online_devices = new Map<string, number | null>();

  initialize = async (
    api: HomeyAPI,
    metrics: PrometheusMetrics,
    profiling: Profiling
  ) => {
    this.api = api;
    this.metrics = metrics;
    this.profiling = profiling;
    await this.updateDeviceList();
    // Adding notifiers
    console.log("Subscribing to device changes");
    (api.devices as any).on(
      "device.create",
      (dev: HomeyAPI.ManagerDevices.Device) => {
        console.log(
          "Adding new device " +
            dev.id +
            " with name " +
            dev.name +
            " driver " +
            dev.driverId
        );
        this.deviceListNeedsUpdate = true;
        setTimeout(() => this.updateDeviceList(), 1000);
      }
    );
    (api.devices as any).on(
      "device.update",
      (dev: HomeyAPI.ManagerDevices.Device) => {
        console.log(
          "Updating device " +
            dev.id +
            " with name " +
            dev.name +
            " driver " +
            dev.driverId
        );
        this.deviceListNeedsUpdate = true;
        setTimeout(() => this.updateDeviceList(), 10000);
      }
    );
    (api.devices as any).on(
      "device.delete",
      (dev: HomeyAPI.ManagerDevices.Device) => {
        console.log(
          "Deleting device " +
            dev.id +
            " with name " +
            dev.name +
            " driver " +
            dev.driverId
        );
        this.deviceListNeedsUpdate = true;
        setTimeout(() => this.updateDeviceList(), 1000);
      }
    );

    (api.zwave as any).on("state", (zwave: any) =>
      this.zwaveStateChange(zwave)
    );
    (api.zigBee as any).on("state", (zigbee: any) =>
      this.zigbeeStateChange(zigbee)
    );
  };

  stop = async () => {};

  updateDeviceList = async () => {
    await this.profiling.timeAsyncCode(async () => {
      if (!this.deviceListNeedsUpdate) return;
      this.deviceListNeedsUpdate = false;
      console.log("Update device list");
      let zones = await this.api.zones.getZones();
      let devices = await this.api.devices.getDevices();

      this.metrics.device_labels.clear();
      for (let key in this.gauge_device) {
        this.gauge_device.get(key)?.reset();
      }
      for (let devId in this.deviceCaps) {
        for (let capInst of this.deviceCaps.get(devId)) {
          capInst.destroy();
        }
      }
      this.deviceCaps.clear();

      for (let devId in devices) {
        this.registerDevice(devId, devices[devId], zones);
      }
    }, "updatedevicelist");
  };

  getDevices = async () => {
    let allDevices = await this.api.devices.getDevices();
    return allDevices;
  };

  registerDevice = (
    devId: string,
    dev: HomeyAPI.ManagerDevices.Device,
    zones: { [key: string]: HomeyAPI.ManagerZones.Zone }
  ) => {
    this.profiling.timeCode(
      () => {
        console.log("Registering device " + devId);
        var labels = getZoneLabels(dev.zone, zones);
        labels.device = devId;
        labels.name = dev.name;
        labels.class = dev.class ? dev.class : "unknown";
        labels.driver = dev.driverUri ? dev.driverUri : "unknown";
        labels.driver_id = dev.driverId ? dev.driverId : "unknown";
        console.log(dev);
        if (!(devId in this.metrics.device_labels)) {
          // Report initial state
          this.metrics.device_labels.set(devId, labels); // Need to do this before reportState
          let s = dev.capabilities;
          let capInsts: HomeyAPI.ManagerDevices.Device.CapabilityInstance[] =
            [];
          for (let sn of s) {
            if (!dev.capabilitiesObj) continue;
            if (!dev.capabilitiesObj[sn]) continue;
            let capId = (dev.capabilitiesObj[sn] as any).id;
            if (!capId) continue;
            let self = this;
            function onCapChg(val: any) {
              if (val !== null && val !== undefined) {
                //console.log(" dev cap " + dev.name + " "+ sn + " is " + val);
                self.reportState(devId, sn, val);
              }
            }
            (dev as any).setMaxListeners(1000); // Silence incorrect memory leak warning if we listen to many devices
            let capInst = dev.makeCapabilityInstance(
              capId,
              onCapChg
            ) as HomeyAPI.ManagerDevices.Device.CapabilityInstance;
            // Report initial state
            capInsts.push(capInst);
            onCapChg(capInst.value);
          }
          this.deviceCaps.set(devId, capInsts); // Register so that we can dispose when device renamed/moved
        } else {
          this.metrics.device_labels.set(devId, labels); // Update labels in case device was renamed/moved
        }
        if (dev.flags.includes("zwave")) {
          let zwaveId = dev.settings.zw_node_id;
          if (zwaveId) {
            console.log(
              "Device " + dev.name + " has Z-Wave node id " + zwaveId
            );
            this.zwave_devices.set(zwaveId, devId);
          }
        }
        if (dev.flags.includes("zigbee")) {
          let zigbeeId = dev.settings.zb_device_id;
          if (zigbeeId) {
            console.log(
              "Device " + dev.name + " has ZigBee device id " + zigbeeId
            );
            this.zigbee_devices.set(zigbeeId, devId);
          }
        }
      },
      "registerdevice",
      { device: devId }
    );
  };

  reportState = (devId: string, statename: string, value: any) => {
    this.profiling.timeCode(
      () => {
        if (value === null || value === undefined) return;

        // Convert type
        if (typeof value === "boolean") value = value ? 1 : 0;
        else if (typeof value === "string") return; // Strings are not yet mapped

        // Make sure state names are valid (e.g. remove dots in names)

        //console.log("State changed for " + devId + ", " + statename);
        if (!(statename in this.gauge_device)) {
          let cleaned_state = statename.replace(/[^A-Za-z0-9_]/g, "_");
          while (cleaned_state in this.gauge_device_cleaned) {
            cleaned_state += "_";
          }
          this.gauge_device_cleaned.set(cleaned_state, statename);
          let key = "homey_device_" + cleaned_state;
          this.gauge_device.set(
            statename,
            new client.Gauge({
              name: key,
              help: "State " + statename,
              labelNames: [
                "device",
                "name",
                "zone",
                "zones",
                "class",
                "driver",
                "driver_id",
              ],
            })
          );
        }
        let labels = this.metrics.device_labels.get(devId);
        if (!labels) {
          console.log("Cannot report unknown device " + devId);
        } else {
          this.gauge_device
            .get(statename)
            ?.labels(
              labels.device,
              labels.name,
              labels.zone,
              labels.zones,
              labels.class,
              labels.driver,
              labels.driver_id
            )
            .set(value);
        }
      },
      "deviceupdate",
      { device: devId }
    );
  };

  zwaveStateChange = (zwave: any) => {
    this.profiling.timeCode(() => {
      if (
        zwave &&
        zwave.zw_state &&
        zwave.zw_state.stats &&
        Object.keys(this.zwave_devices).length > 0
      ) {
        let ts = zwave.$lastUpdated * 1e-3;
        if (!ts) return;
        for (let zwn in this.zwave_devices) {
          let net = zwave.zw_state.stats["node_" + zwn + "_network"];
          let labels = this.metrics.device_labels.get(
            this.zwave_devices.get(zwn) ?? ""
          );
          if (!labels) continue;

          if (net) {
            this.metrics.gauge_tx_total
              .labels(
                zwn,
                labels.device,
                labels.name,
                labels.zone,
                labels.zones
              )
              .set(net.tx);
            this.metrics.gauge_tx_error
              .labels(
                zwn,
                labels.device,
                labels.name,
                labels.zone,
                labels.zones
              )
              .set(net.tx_err);
            this.metrics.gauge_rx_total
              .labels(
                zwn,
                labels.device,
                labels.name,
                labels.zone,
                labels.zones
              )
              .set(net.rx);
          }
          let online = zwave.zw_state.stats["node_" + zwn + "_online"];
          if (online === undefined) online = true;

          var timeOnline = 0.0;
          let prevOnline = this.online_devices.get(
            this.zwave_devices.get(zwn) ?? ""
          );
          if (prevOnline) {
            timeOnline = ts - prevOnline;
          }

          if (online) {
            this.online_devices.set(this.zwave_devices.get(zwn) ?? "", ts);
            if (prevOnline === null) {
              this.metrics.counter_online_count
                .labels(
                  zwn,
                  labels.device,
                  labels.name,
                  labels.zone,
                  labels.zones
                )
                .inc();
            }
          } else {
            this.online_devices.set(this.zwave_devices.get(zwn) ?? "", null);
          }
          if (timeOnline > 0) {
            this.metrics.counter_online_time
              .labels(
                zwn,
                labels.device,
                labels.name,
                labels.zone,
                labels.zones
              )
              .inc(timeOnline);
          }
        }
      }
    }, "zwave");
  };

  zigbeeStateChange(zigbee: any) {
    this.profiling.timeCode(() => {
      if (
        zigbee &&
        zigbee.zigbee_state &&
        zigbee.zigbee_state.devices &&
        Object.keys(this.zigbee_devices).length > 0
      ) {
        let ts = zigbee.$lastUpdated * 1e-3;
        if (!ts) return;
        for (let node of zigbee.zigbee_state.devices) {
          if (!node.deviceId) continue;
          let zbd = this.zigbee_devices.get(node.deviceId);
          if (!zbd) continue;

          let labels = this.metrics.device_labels.get(zbd);
          if (!labels) continue;

          let online = node.status !== "offline";

          var timeOnline = 0.0;
          let prevOnline = this.online_devices.get(zbd);
          if (prevOnline) {
            timeOnline = ts - prevOnline;
          }

          if (online) {
            this.online_devices.set(zbd, ts);
            if (prevOnline === null) {
              this.metrics.counter_online_count
                .labels(
                  node.deviceId,
                  labels.device,
                  labels.name,
                  labels.zone,
                  labels.zones
                )
                .inc();
            }
          } else {
            this.online_devices.set(zbd, null);
          }
          if (timeOnline > 0) {
            this.metrics.counter_online_time
              .labels(
                node.deviceId,
                labels.device,
                labels.name,
                labels.zone,
                labels.zones
              )
              .inc(timeOnline);
          }
        }
      }
    }, "zigbee");
  }
}

function getZoneLabels(
  zoneId: string,
  zones: { [key: string]: HomeyAPI.ManagerZones.Zone }
): { [key: string]: string } {
  let zone = zones[zoneId];
  if (!zone) return {};
  if (!zone.parent) {
    let ret = {} as any;
    ret.home = ret.zone = ret.zones = zone.name;
    return ret;
  } else {
    let ret = getZoneLabels(zone.parent, zones);
    ret.zone = zone.name;
    ret.zones += "/" + ret.zone.replace("/", " ");
    return ret;
  }
}
