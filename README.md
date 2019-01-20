# Prometheus exporter for Athom Homey

[![Build status](https://dev.azure.com/github-rickard/homey-prometheus-exporter/_apis/build/status/rickardp.homey-prometheus-exporter?branchName=master&label=build)](https://dev.azure.com/github-rickard/homey-prometheus-exporter/_build?definitionId=1) [![Sonarcloud Status](https://sonarcloud.io/api/project_badges/measure?project=rickardp_homey-prometheus-exporter&metric=alert_status)](https://sonarcloud.io/dashboard?id=rickardp_homey-prometheus-exporter)

Prometheus exporter for Homey.

The following metrics are exported:

* General system information (load averages, memory, storage).
* Device state information (sensor values, state of switches, etc.). Device state gauges are named `homey_device_<state>` and have labels for device ID, name and zones.
* User presence (present/away, awake/asleep)

## How to use it

First, you need a Prometheus.io instance. The easiest way to install such an instance is to use Docker. This app has been developed
and tested with the `prom/prometheus:v2.1.0` image.


To add the Homey to Prometheus, you need to add the IP of Homey and port 9414 to the list of scrape targets. For example (`prometheus.yml`):

    <...>
    scrape_configs:
      <....>
      - job_name: 'homey'
        scrape_interval: 15s

        # metrics_path defaults to '/metrics'
        # scheme defaults to 'http'.

        static_configs:
         - targets: [
             '<ip address of Homey>:9414'
        ]

Here is an example docker-compose file:

    grafana:
      image: grafana/grafana:5.0.1
      ports:
      - 3000:3000
      volumes:
        - ./data/grafana:/var/lib/grafana
      restart: unless-stopped
      environment:
        - GF_SECURITY_ADMIN_PASSWORD=mysecretpassword
        - GF_USERS_ALLOW_SIGN_UP=false
        - GF_AUTH_ANONYMOUS_ENABLED=true
    prometheus:
      image: prom/prometheus:v2.1.0
      ports:
        - 9090:9090
      volumes:
        - ./config/prometheus:/etc/prometheus:ro
        - ./data/prometheus:/prometheus
        - ./logs/prometheus:/logs
      command:
        - '--config.file=/etc/prometheus/prometheus.yml'
        - '--storage.tsdb.path=/prometheus'
        - '--storage.tsdb.retention=365d'
        - '--web.enable-admin-api'


## Troubleshooting

Browse to `http://<homey_ip>:9414/metrics` and make sure there is a response.

## How to configure it

There is currently no configuration needed for this app.


