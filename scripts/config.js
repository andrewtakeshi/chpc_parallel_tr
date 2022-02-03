let config = {};

/**
 * Load some variables from config file.
 * TODO: Think about using JSON instead so we don't need to pull in jsyaml for this small thing.
 */
$.get('config.yaml')
    .done(data => {
        config = jsyaml.loadAll(data)[1];
    })
    .fail(_ => {
        config = {
            'api_server': '127.0.0.1:5000',
            'tr_api': '/api/v1/resources/traceroutes',
            'remote_timeout': 25000,
            'system_timeout': 10000,
            'min_zoom': 1,
            'max_zoom': 10
        }
    })
    .always(_ => {
        Object.freeze(config);
    });