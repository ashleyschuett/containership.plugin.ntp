var ContainershipPlugin = require('containership.plugin');
var _ = require('lodash');
var request = require('request');

module.exports = new ContainershipPlugin({
    name: 'ntp',
    type: 'core',

    initialize: function(core) {
        var applicationName = 'ntpd';
        core.logger.register(applicationName);

        const addApplication = () => {
            const key = [core.constants.myriad.APPLICATION_PREFIX, applicationName].join(core.constants.myriad.DELIMITER);

            core.cluster.myriad.persistence.get(key, (err) => {
                if(err) {
                    core.applications.add({
                        id: applicationName,
                        image: 'jeremykross/ntp:latest',
                        cpus: 0.1,
                        memory: 16,
                        privileged: true,
                        tags: {
                            constraints: {
                                per_host: 1
                            },
                            metadata: {
                                plugin: applicationName,
                                ancestry: 'containership.plugin'
                            }
                        },
                    }, (err) => {
                        if(!err) {
                            core.loggers[applicationName].log('verbose', `Created ${applicationName}!`);
                        } else {
                            core.loggers[applicationName].log('verbose', `Couldn't create ${applicationName}: ${JSON.stringify(err)}`);
                        }
                    });
                } else {
                    core.loggers[applicationName].log('verbose', `${applicationName} already exists, skipping create!`);
                }
            });
        };

        if(core.cluster.praetor.is_controlling_leader()) {
            addApplication();
        }

        core.cluster.legiond.on('myriad.bootstrapped', () => {
            addApplication();
        });
    },

    reload: function() {}
});
