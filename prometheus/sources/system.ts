import { HomeyAPI } from 'athom-api';
import MetricSource from './source';
import Profiling from '../../profiling';
import PrometheusMetrics from '../metrics';

export default class SystemSource implements MetricSource {
  api: HomeyAPI = null as unknown as HomeyAPI;
  metrics: PrometheusMetrics = null as unknown as PrometheusMetrics;
  profiling: Profiling = null as unknown as Profiling;

  initialize = async (api: HomeyAPI, metrics: PrometheusMetrics, profiling: Profiling) => {
    this.api = api;
    this.metrics = metrics;
    this.profiling = profiling;
    const systemInfo = (await api.system.getInfo()) as any; // Bad type info

    const appStartTime = Date.parse(systemInfo.date);
    const bootTime = appStartTime - 1000 * systemInfo.uptime;

    metrics.gauge_app_start_time.set(appStartTime);
    metrics.gauge_boot_time.labels(systemInfo.homeyVersion).set(bootTime);

    await this.updateSystemInfoCpu();
    await this.updateSystemInfoStorage();
    await this.updateSystemInfoMemory();
  };

  stop = async () => {};

  async updateSystemInfoMemory() {
    setTimeout(this.updateSystemInfoMemory.bind(this), 30000);
    await this.profiling.timeAsyncCode(async () => {
      try {
        const memoryInfo = (await this.api.system.getMemoryInfo()) as any; // Bad types from Homey API
        this.metrics.gauge_memory_total.set(memoryInfo.total);
        this.metrics.gauge_memory_free.set(memoryInfo.free);
        this.metrics.gauge_memory_swap.set(memoryInfo.swap);
        for (const app of Object.keys(memoryInfo.types)) {
          this.metrics.gauge_memory_used.labels(app).set(memoryInfo.types[app].size);
        }
      } catch (err: any) {
        console.log(`Error getting memory info: ${err.message}`);
      }
    }, 'systeminfo:memory');
  }

  async updateSystemInfoCpu() {
    setTimeout(this.updateSystemInfoCpu.bind(this), 30000);
    await this.profiling.timeAsyncCode(async () => {
      try {
        const systemInfo = (await this.api.system.getInfo()) as any;

        this.metrics.gauge_load_average_1.set(systemInfo.loadavg[0]);
        this.metrics.gauge_load_average_5.set(systemInfo.loadavg[1]);
        this.metrics.gauge_load_average_15.set(systemInfo.loadavg[2]);

        this.metrics.gauge_cpu_speed.set(systemInfo.cpus[0].speed);
        for (const time of Object.keys(systemInfo.cpus[0].times)) {
          this.metrics.gauge_cpu.labels(time).set(systemInfo.cpus[0].times[time]);
        }
      } catch (err: any) {
        console.log(`Error getting CPU info: ${err.message}`);
      }
    }, 'systeminfo:cpu');
  }

  async updateSystemInfoStorage() {
    setTimeout(this.updateSystemInfoStorage.bind(this), 600000);
    await this.profiling.timeAsyncCode(async () => {
      try {
        const storageInfo = (await this.api.system.getStorageInfo()) as any;
        this.metrics.gauge_storage_total.set(storageInfo.total);
        this.metrics.gauge_storage_free.set(storageInfo.free);
        for (const app of Object.keys(storageInfo.types)) {
          this.metrics.gauge_storage_used.labels(app).set(storageInfo.types[app].size);
        }
      } catch (err: any) {
        console.log(`Error getting storage info: ${err.message}`);
      }
    }, 'systeminfo:storage');
  }
}
