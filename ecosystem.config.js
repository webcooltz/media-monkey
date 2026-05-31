module.exports = {
  apps: [
    {
      name: 'media-monkey',
      script: 'server/index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
