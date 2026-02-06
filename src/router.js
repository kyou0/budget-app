export class Router {
  constructor(routes) {
    this.routes = routes;
    window.addEventListener('hashchange', () => this.handleRoute());
  }

  init() {
    this.handleRoute();
  }

  handleRoute() {
    const hash = window.location.hash || '#dashboard';
    const route = this.routes[hash] || this.routes['#dashboard'];
    route();
  }

  navigate(hash) {
    window.location.hash = hash;
  }
}
