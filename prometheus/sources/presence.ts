import { HomeyAPI } from 'athom-api';
import Profiling from '../../profiling';
import PrometheusMetrics from '../metrics';
import MetricSource from './source';

export default class PresenceSource implements MetricSource {
  api: HomeyAPI = null as unknown as HomeyAPI;
  metrics: PrometheusMetrics = null as unknown as PrometheusMetrics;
  profiling: Profiling = null as unknown as Profiling;
  userMap: { [uid: string]: string } = {};

  initialize = async (api: HomeyAPI, metrics: PrometheusMetrics, profiling: Profiling) => {
    this.api = api;
    this.metrics = metrics;
    this.profiling = profiling;
    this.updateUserMap();
  };

  stop = async () => {};

  updateUserMap = async () => {
    console.log('Updating user map');
    const users = await this.api.users.getUsers();
    for (const uid of Object.keys(users)) {
      if (!this.userMap[uid]) {
        console.log(`User ${uid} is ${users[uid].athomId}`);
        this.userMap[uid] = users[uid].athomId;
        (users[uid] as any).on('$update', (user: HomeyAPI.ManagerUsers.User) => {
          console.log(`User ${user.athomId}changed, updating presence`);
          this.updatePresence(users);
        });
      }
    }
    this.updatePresence(users);
  };

  updatePresence(users: { [key: string]: HomeyAPI.ManagerUsers.User }) {
    this.profiling.timeCode(() => {
      try {
        for (const uid of Object.keys(this.userMap)) {
          const { present } = users[uid];
          const { asleep } = users[uid];
          console.log(`User ${users[uid].athomId}: present ${present} asleep ${asleep}`);
          this.metrics.gauge_present.labels(users[uid].athomId, users[uid].name).set(present ? 1 : 0);
          this.metrics.gauge_asleep.labels(users[uid].athomId, users[uid].name).set(asleep ? 1 : 0);
        }
      } catch (err: any) {
        console.log(`Error updating presence info: ${err.message}`);
      }
    }, 'presence');
  }
}
