'use strict';

const _ = require('lodash');
const ContainershipPlugin = require('containership.plugin');

const Docker = require("dockerode");
const docker = new Docker({socketPath: "/var/run/docker.sock"});

module.exports = new ContainershipPlugin({
    name: 'ntp',
    type: 'core',

    initialize: function(core) {
        const applicationName = 'ntpd';
        core.logger.register(applicationName);

        const addApplication = () => {
            const key = [core.constants.myriad.APPLICATION_PREFIX, applicationName].join(core.constants.myriad.DELIMITER);

            core.cluster.myriad.persistence.get(key, (err) => {
                if(err) {
                    if(err.name === core.constants.myriad.ENOKEY) {
                        core.applications.add({
                            id: applicationName,
                            image: 'containership/ntp:latest',
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
                                core.loggers[applicationName].log('error', `Couldnt create ${applicationName}: ${err}`);
                            }
                        });
                    } else {
                        core.loggers[applicationName].log('verbose', `${applicationName} already exists, skipping create!`);
                    }
                } else {
                        core.loggers[applicationName].log('error', `Unexpected error accessing myriad when loading ${applicationName}: ${err}`);
                }
            });
        };

        const addNtpToLeaderNode = (nodeId) => {
            docker.listContainers((err, containers) => {
                if (err) {
                    return core.loggers[applicationName].log('error', `Failed to list existing containers on leader node[${nodeId}]\n${err.message}`);
                }

                let isNtpRunning = false;

                _.forEach(containers, (container) => {
                    if (container.Names[0].slice(1) === 'containership-ntp') {
                        isNtpRunning = true;
                        return false; // break out of forEach
                    }
                });

                if (isNtpRunning) {
                    return;
                }

                docker.pull('containership/ntp:latest', (err, stream) => {
                    if (err) {
                        return core.loggers[applicationName].log('error', `Failed to pull containership/ntp on leader node[${nodeId}]\n${err.message}`);
                    }

                    docker.modem.followProgress(stream, onFinished);
                    function onFinished(err, output) {
                        if (err) {
                            return core.loggers[applicationName].log('error', `Failed to pull containership/ntp on leader node[${nodeId}]\n${err.message}`);
                        }

                        core.loggers[applicationName].log('verbose', `Starting containership/ntp on leader node[${nodeId}]`);
                        docker.run('containership/ntp:latest', [], process.stdout, {
                            name: 'containership-ntp',
                            Binds: ["/var/run/docker.sock:/var/run/docker.sock"],
                            HostConfig: {
                                Privileged: true,
                                RestartPolicy: {
                                    Name: "on-failure",
                                    MaximumRetryCount: 5
                                },
                                CpuShares: Math.floor(0.1 * 1024),
                                Memory: 16 * 1024 * 1024 // 16MB,
                            }
                        }, (err, data, container) => {
                            if(err) {
                                return core.loggers[applicationName].log('error', `Failed to run containership/ntp on leader node[${nodeId}]\n${err.message}`);
                            }
                        });
                    }
                });
            });
        };

        // launch NTP on leader nodes
        if(core.options.mode == 'leader') {
            const attributes = core.cluster.legiond.get_attributes();
            const nodeId = attributes.id;
            addNtpToLeaderNode(nodeId);
        }

        if(core.cluster.praetor.is_controlling_leader()) {
            addApplication();
        }

        core.cluster.legiond.on('myriad.bootstrapped', () => {
            addApplication();
        });
    },

    reload: function() {}
});
