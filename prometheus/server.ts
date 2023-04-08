import express, { Request, Response } from 'express';
import { Server } from 'http';
import PrometheusMetrics from './metrics';

const PORT = 9414;

export default class PrometheusServer {
  server: Server | null = null;
  metrics: PrometheusMetrics;

  constructor(metrics: PrometheusMetrics) {
    this.metrics = metrics;
  }

  start = () => {
    if (this.server !== null) {
      console.log('Already started');
      return;
    }
    console.log(`Starting Prometheus exporter server on port ${PORT}`);
    const expressServer = express();
    expressServer.get('/metrics', this.respond);
    expressServer.get('/prometheus/metrics', this.respond);
    this.server = expressServer.listen(PORT);
  };

  stop = () => {
    console.log('Stopping Prometheus exporter server');
    this.server?.close();
  };

  respond = async (request: Request, response: Response) => {
    response.contentType('text/plain; charset=utf-8');
    response.end(await this.metrics?.serve());
  };
}
