import client from "prom-client";

export default class PrometheusMetrics {
  readonly device_labels = new Map<string, { [key: string]: string }>();
  readonly gauge_boot_time = new client.Gauge({
    name: "homey_boot_time",
    help: "Time of last Homey reboot",
    labelNames: ["version"],
  });
  readonly gauge_app_start_time = new client.Gauge({
    name: "homey_app_start_time",
    help: "Time of last exporter app start",
  });
  readonly gauge_memory_total = new client.Gauge({
    name: "homey_memory_total",
    help: "Total memory",
  });
  readonly gauge_memory_free = new client.Gauge({
    name: "homey_memory_free",
    help: "Free memory",
  });
  readonly gauge_memory_swap = new client.Gauge({
    name: "homey_memory_swap",
    help: "Swap memory",
  });
  readonly gauge_memory_used = new client.Gauge({
    name: "homey_memory_used",
    help: "Used memory per component",
    labelNames: ["component"],
  });
  readonly gauge_storage_total = new client.Gauge({
    name: "homey_storage_total",
    help: "Total storage",
  });
  readonly gauge_storage_free = new client.Gauge({
    name: "homey_storage_free",
    help: "Free storage",
  });
  readonly gauge_storage_used = new client.Gauge({
    name: "homey_storage_used",
    help: "Used storage per component",
    labelNames: ["component"],
  });
  readonly gauge_cpu_speed = new client.Gauge({
    name: "homey_cpu_speed",
    help: "Speed of CPU",
  });
  readonly gauge_cpu = new client.Gauge({
    name: "homey_cpu",
    help: "CPU time per mode",
    labelNames: ["mode"],
  });
  readonly gauge_load_average_1 = new client.Gauge({
    name: "homey_load_average_1",
    help: "Load average (1 minute)",
  });
  readonly gauge_load_average_5 = new client.Gauge({
    name: "homey_load_average_5",
    help: "Load average (5 minutes)",
  });
  readonly gauge_load_average_15 = new client.Gauge({
    name: "homey_load_average_15",
    help: "Load average (15 minutes)",
  });
  readonly gauge_tx_total = new client.Gauge({
    name: "homey_tx_total",
    help: "Total sent packets",
    labelNames: ["node", "device", "name", "zone", "zones"],
  });
  readonly gauge_tx_error = new client.Gauge({
    name: "homey_tx_error",
    help: "Failed sent packets",
    labelNames: ["node", "device", "name", "zone", "zones"],
  });
  readonly gauge_rx_total = new client.Gauge({
    name: "homey_rx_total",
    help: "Total received packets",
    labelNames: ["node", "device", "name", "zone", "zones"],
  });
  readonly counter_online_time = new client.Counter({
    name: "homey_device_online_time_seconds",
    help: "Seconds of time online for the device",
    labelNames: ["node", "device", "name", "zone", "zones"],
  });
  readonly counter_online_count = new client.Counter({
    name: "homey_device_online_count",
    help: "Number of time device went online",
    labelNames: ["node", "device", "name", "zone", "zones"],
  });
  readonly gauge_present = new client.Gauge({
    name: "homey_user_present",
    help: "User is at home",
    labelNames: ["athomId", "name"],
  });
  readonly gauge_asleep = new client.Gauge({
    name: "homey_user_asleep",
    help: "User is at asleep",
    labelNames: ["athomId", "name"],
  });
  readonly gauge_variable = new client.Gauge({
    name: "homey_variable_value",
    help: "Variable value",
    labelNames: ["name"],
  });
  readonly gauge_weather_temperature = new client.Gauge({
    name: "homey_weather_temperature",
    help: "Temperature (Weather API)",
    labelNames: ["city", "country"],
  });
  gauge_weather_humidity = new client.Gauge({
    name: "homey_weather_humidity",
    help: "Humidity (Weather API)",
    labelNames: ["city", "country"],
  });
  gauge_weather_pressure = new client.Gauge({
    name: "homey_weather_pressure",
    help: "Pressure (Weather API)",
    labelNames: ["city", "country"],
  });

  counter_self_timer = new client.Counter({
    name: "homey_exporter_self_time_seconds",
    help: "Time spent in Prometheus exporter",
    labelNames: ["type", "action", "device", "name", "zone", "zones"],
  });
  readonly counter_self_counter = new client.Counter({
    name: "homey_exporter_self_call_count",
    help: "Calls in Prometheus exporter",
    labelNames: ["action", "device", "name", "zone", "zones"],
  });

  serve = async () => await client.register.metrics();
}
