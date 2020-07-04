Use the data from your Homey in Prometheus queries. For example, you can use this app to create Grafana dashboards for your home!

The following metrics are exported:

* General system information (load averages, memory, storage).
* Device state information (sensor values, state of switches, etc.). Device state gauges are named `homey_device_<state>` and have labels for device ID, name and zones.
* User presence (present/away, awake/asleep)
* Logic Variables
* Weather data


For support and discussions around the app, please use the Homey Community thread for the app (link below).

For bug reports, please go ahead and create an issue directly in GitHub. Pull requests are also welcome!