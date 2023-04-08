import { HomeyAPI } from 'athom-api';
import MetricSource from './source';
import PrometheusMetrics from '../metrics';
import Profiling from '../../profiling';

export default class VariablesSource implements MetricSource {
  api: HomeyAPI = null as unknown as HomeyAPI;
  metrics: PrometheusMetrics = null as unknown as PrometheusMetrics;
  profiling: Profiling = null as unknown as Profiling;

  initialize = async (api: HomeyAPI, metrics: PrometheusMetrics, profiling: Profiling) => {
    this.api = api;
    this.metrics = metrics;
    this.profiling = profiling;

    (api.logic as any).on('variable.update', (variable: HomeyAPI.ManagerLogic.Variable) =>
      this.updateVariable(variable),
    );
    const vars = await api.logic.getVariables();
    for (const value of Object.values(vars)) {
      this.updateVariable(value);
    }
  };

  stop = async () => {};

  updateVariable(variable: HomeyAPI.ManagerLogic.Variable) {
    this.profiling.timeCode(
      () => {
        let value;
        if (variable.type === 'number') {
          value = variable.value ? variable.value : 0;
        } else if (variable.type === 'boolean') {
          value = variable.value ? 1 : 0;
        } else {
          return; // Cannot represent strings in Prometheus
        }
        if (value === undefined || !variable.name) return;
        this.metrics.gauge_variable.labels(variable.name).set(value);
      },
      'variable',
      { name: variable.name },
    );
  }
}
