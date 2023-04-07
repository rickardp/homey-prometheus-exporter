import PrometheusMetrics from "./prometheus/metrics";

export default class Profiling {
  readonly metrics: PrometheusMetrics;

  constructor(metrics: PrometheusMetrics) {
    this.metrics = metrics;
  }

  timeAsyncCode = async (
    func: () => void,
    action: string,
    labels: any | null = null
  ) => {
    const prevCpuTime = process.cpuUsage();
    const prevRealTime = Date.now();
    try {
      return await func();
    } finally {
      const lbl = "_" + action;
      if (!labels) {
        labels = {};
      } else if (labels.device && !labels.zone) {
        labels = this.metrics.device_labels.get(labels.device);
      }
      if (!labels.name) labels.name = lbl;
      if (!labels.device) labels.device = lbl;
      if (!labels.zone) labels.zone = lbl;
      if (!labels.zones) labels.zones = lbl;
      const deltaNow = Date.now() - prevRealTime;
      const cpuUsage = process.cpuUsage(prevCpuTime);
      if (deltaNow > 0) {
        // Avoid violation of Prometheus API due to time warp
        this.metrics.counter_self_timer
          .labels(
            "real",
            action,
            labels.device,
            labels.name,
            labels.zone,
            labels.zones
          )
          .inc(deltaNow * 1e-3);
      }
      this.metrics.counter_self_timer
        .labels(
          "user",
          action,
          labels.device,
          labels.name,
          labels.zone,
          labels.zones
        )
        .inc(cpuUsage.user * 1e-6);
      this.metrics.counter_self_timer
        .labels(
          "system",
          action,
          labels.device,
          labels.name,
          labels.zone,
          labels.zones
        )
        .inc(cpuUsage.system * 1e-6);
      this.metrics.counter_self_counter
        .labels(action, labels.device, labels.name, labels.zone, labels.zones)
        .inc();
    }
  };

  timeCode = (func: () => void, action: string, labels: any | null = null) => {
    const prevCpuTime = process.cpuUsage();
    const prevRealTime = Date.now();
    try {
      return func();
    } finally {
      const lbl = "_" + action;
      if (!labels) {
        labels = {};
      } else if (labels.device && !labels.zone) {
        labels = this.metrics.device_labels.get(labels.device);
      }
      if (!labels.name) labels.name = lbl;
      if (!labels.device) labels.device = lbl;
      if (!labels.zone) labels.zone = lbl;
      if (!labels.zones) labels.zones = lbl;
      const deltaNow = Date.now() - prevRealTime;
      const cpuUsage = process.cpuUsage(prevCpuTime);
      if (deltaNow > 0) {
        // Avoid violation of Prometheus API due to time warp
        this.metrics.counter_self_timer
          .labels(
            "real",
            action,
            labels.device,
            labels.name,
            labels.zone,
            labels.zones
          )
          .inc(deltaNow * 1e-3);
      }
      this.metrics.counter_self_timer
        .labels(
          "user",
          action,
          labels.device,
          labels.name,
          labels.zone,
          labels.zones
        )
        .inc(cpuUsage.user * 1e-6);
      this.metrics.counter_self_timer
        .labels(
          "system",
          action,
          labels.device,
          labels.name,
          labels.zone,
          labels.zones
        )
        .inc(cpuUsage.system * 1e-6);
      this.metrics.counter_self_counter
        .labels(action, labels.device, labels.name, labels.zone, labels.zones)
        .inc();
    }
  };
}
