# Prometheus

Prometheus exporter for Homey. This app is in early development. Apologies for the lack of proper documentation. More will come.

The following metrics are exported:

* General system information (load averages, memory, storage)
* Device state information (sensor values, state of switches, etc.)


## How to use it

First, you need a Prometheus.io instance. The easiest way to install such an instance is to use Docker. This app has been developed
and tested with the `prom/prometheus:v2.1.0` image.

To connect Prometheus to your Homey, ensure the Homey is reachable directly from the Prometheus instance. Then add `<homey_ip>:9414` to the list of 
targets.

## Troubleshooting

Browse to `http://<homey_ip>:9414/metrics` and make sure there is a response.

## How to configure it

There is currently no configuration needed for this app.


