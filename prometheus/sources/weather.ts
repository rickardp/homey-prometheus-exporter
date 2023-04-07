import { HomeyAPI } from "athom-api";
import MetricSource from "./source";
import PrometheusMetrics from "../metrics";
import Profiling from "../../profiling";
export default class WeatherSource implements MetricSource {
  api: HomeyAPI = null as unknown as HomeyAPI;
  metrics: PrometheusMetrics = null as unknown as PrometheusMetrics;
  profiling: Profiling = null as unknown as Profiling;

  initialize = async (
    api: HomeyAPI,
    metrics: PrometheusMetrics,
    profiling: Profiling
  ) => {
    this.api = api;
    this.metrics = metrics;
    this.profiling = profiling;
    let weather = await api.weather.getWeather();

    (api.weather as any).on("weather", () => this.updateWeather(weather));
    this.updateWeather(weather);
  };
  stop = async () => {};

  updateWeather = (weather: any) => {
    this.profiling.timeCode(() => {
      if (weather) {
        this.metrics.gauge_weather_humidity
          .labels(weather.city, weather.country)
          .set(weather.humidity * 100);
        this.metrics.gauge_weather_pressure
          .labels(weather.city, weather.country)
          .set(weather.pressure * 1e3);
        this.metrics.gauge_weather_temperature
          .labels(weather.city, weather.country)
          .set(weather.temperature);
      }
    }, "weather");
  };
}
