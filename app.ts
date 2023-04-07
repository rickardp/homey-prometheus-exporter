//import sourceMapSupport from "source-map-support";
//sourceMapSupport.install();
import Homey from "homey";
import { HomeyAPI } from "athom-api";

import PrometheusMetrics from "./prometheus/metrics";
import PrometheusServer from "./prometheus/server";

import DevicesSource from "./prometheus/sources/devices";
import PresenceSource from "./prometheus/sources/presence";
import SystemSource from "./prometheus/sources/system";
import VariablesSource from "./prometheus/sources/variables";
import WeatherSource from "./prometheus/sources/weather";
import MetricSource from "./prometheus/sources/source";
import Profiling from "./profiling";

// Uncomment the line above to enable the inspector (to use Chrome as a debugger)
// (execution will stop until a debugger is attached)
//require('inspector').open(9229, '0.0.0.0', true);

class PrometheusApp extends Homey.App {
  readonly metrics = new PrometheusMetrics();
  readonly server = new PrometheusServer(this.metrics);
  readonly profiling = new Profiling(this.metrics);
  readonly sources: MetricSource[] = [
    new DevicesSource(),
    new PresenceSource(),
    new SystemSource(),
    new VariablesSource(),
    new WeatherSource(),
  ];
  api: HomeyAPI | null = null;

  onInit = async () => {
    this.server.start();
    this.homey.setTimeout(this.initializeMetrics, 10);
  };

  onUninit = async () => {
    this.server.stop();
    for (let source of this.sources) {
      try {
        await source.stop();
      } catch (e) {
        console.log(e);
        console.log("Error stopping source");
      }
    }
  };

  initializeMetrics = async () => {
    await this.profiling.timeAsyncCode(async () => {
      try {
        if (this.api == null) {
          this.api = await HomeyAPI.forCurrentHomey(this.homey);
        }
        console.log("Initializing sources.");
        for (let source of this.sources) {
          await source.initialize(this.api, this.metrics, this.profiling);
        }
      } catch (e) {
        console.log(e);
        console.log("Error during initialization. Trying again later.");
        this.homey.setTimeout(this.initializeMetrics, 30000);
      }
    }, "init");
  };
}
module.exports = PrometheusApp;
