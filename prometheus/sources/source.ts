import { HomeyAPI } from 'athom-api';
import PrometheusMetrics from '../metrics';
import Profiling from '../../profiling';

export default interface MetricSource {
  initialize: (api: HomeyAPI, metrics: PrometheusMetrics, profiling: Profiling) => Promise<void>;

  stop: () => Promise<void>;
}
