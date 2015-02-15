/*
 * Copyright 2013, All Rights Reserved.
 *
 * Code licensed under the BSD License:
 * https://github.com/node-gh/gh/blob/master/LICENSE.md
 *
 * @author Eduardo Lundgren <edu@rdo.io>
 */

'use strict';

var fs = require('fs'),
    logger = require('./logger'),
    child_process = require('child_process'),
    path = require('path'),
    userhome = require('userhome'),
    which = require('which'),
    execSync = child_process.execSync || require('execSync'),
    cache = {},
    plugins;

// -- Config -------------------------------------------------------------------

exports.getNodeModulesGlobalPath = function() {
    var key = 'plugins_path',
        path = this.getConfig()[key];

    if (!path) {
        path = execSync('npm root -g').toString().trim();
        exports.writeGlobalConfig(key, path);
    }

    return path;
};

exports.getUserHomePath = function() {
    return userhome('.gh.json');
};

function getConfig(opt_plugin) {
    var globalConfig = exports.getGlobalConfig(opt_plugin),
        projectConfig,
        result = {};

    try {
        projectConfig = require(exports.getProjectConfigPath());

        Object.keys(globalConfig).forEach(function(key) {
            result[key] = globalConfig[key];
        });

        Object.keys(projectConfig).forEach(function(key) {
            result[key] = projectConfig[key];
        });

        return result;
    }
    catch (e) {
        if (e.code !== 'MODULE_NOT_FOUND') {
            throw e;
        }

        return globalConfig;
    }
}

exports.getConfig = function(opt_plugin) {
    if (!cache[opt_plugin]) {
        cache[opt_plugin] = getConfig(opt_plugin);
    }

    return cache[opt_plugin];
};

exports.getGlobalConfig = function(opt_plugin) {
    var config,
        configPath,
        userConfig;

    configPath = exports.getUserHomePath();

    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, '{}');
        cache = {};
    }

    config = require(exports.getGlobalConfigPath());
    userConfig = require(configPath);

    Object.keys(userConfig).forEach(function(key) {
        config[key] = userConfig[key];
    });

    if (opt_plugin) {
        exports.getPlugins().forEach(function(plugin) {
            exports.addPluginConfig(config, plugin);
        });
    }

    return config;
};

exports.getGlobalConfigPath = function() {
    return path.join(__dirname, '../', 'default.gh.json');
};

exports.getProjectConfigPath = function() {
    return path.join(process.cwd(), '.gh.json');
};

exports.removeGlobalConfig = function(key) {
    var config = exports.getGlobalConfig();

    delete config[key];

    fs.writeFileSync(
        exports.getUserHomePath(),
        JSON.stringify(config, null, 4)
    );
    cache = {};
};

exports.writeGlobalConfig = function(jsonPath, value) {
    var config = exports.getGlobalConfig(),
        i,
        output,
        path,
        pathLen;

    path = jsonPath.split('.');
    output = config;

    for (i = 0, pathLen = path.length; i < pathLen; i++) {
        output[path[i]] = config[path[i]] || (i + 1 === pathLen ? value : {});
        output = output[path[i]];
    }

    fs.writeFileSync(
        exports.getUserHomePath(),
        JSON.stringify(config, null, 4)
    );
    cache = {};
};

exports.writeGlobalConfigCredentials = function(user, token) {
    var configPath = exports.getUserHomePath();

    exports.writeGlobalConfig('github_user', user);
    exports.writeGlobalConfig('github_token', token);
    logger.success('Writing GH config data: ' + configPath);
};

// -- Plugins ------------------------------------------------------------------

exports.addPluginConfig = function(config, plugin) {
    var pluginConfig,
        userConfig;

    try {
        // Always use the plugin name without prefix. To be safe removing "gh-"
        // prefix from passed plugin.
        plugin = exports.getPluginBasename(plugin || process.env.NODEGH_PLUGIN);

        pluginConfig = require(path.join(
            exports.getNodeModulesGlobalPath(), 'gh-' + plugin, '.gh.json'));

        // Merge default plugin configuration with the user's.
        userConfig = config.plugins[plugin] || {};

        Object.keys(userConfig).forEach(function(key) {
            pluginConfig[key] = userConfig[key];
        });

        config.plugins[plugin] = pluginConfig;
    }
    catch (e) {
        if (e.code !== 'MODULE_NOT_FOUND') {
            throw e;
        }
    }
};

function getPlugins() {
    var pluginsPath = exports.getNodeModulesGlobalPath();

    try {
        plugins = fs.readdirSync(pluginsPath).filter(function(plugin) {
            return plugin.substring(0, 3) === 'gh-';
        });
    }
    catch(e) {
        plugins = [];
        logger.warning('Can\'t read plugins directory.');
    }
    finally {
        return plugins;
    }
}

exports.getPlugins = function() {
    if (!plugins) {
        plugins = getPlugins();
    }

    return plugins;
};

exports.getPlugin = function(plugin) {
    plugin = exports.getPluginBasename(plugin);

    return require(exports.getPluginPath('gh-' + plugin));
};

exports.getPluginPath = function(plugin) {
    return which.sync(plugin);
};

exports.getPluginBasename = function(plugin) {
    return plugin && plugin.replace('gh-', '');
};

exports.isPluginIgnored = function(plugin) {
    if (exports.getConfig().ignored_plugins.indexOf(exports.getPluginBasename(plugin)) > -1) {
        return true;
    }

    return false;
};