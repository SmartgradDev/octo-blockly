const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// Base config that applies to either development or production mode.
const config = {
  entry: {
    index: './src/index.ts',
    step2: './src/step2.ts',
  },
  output: {
    // Compile each entry file into its respective bundle.
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  // Enable webpack-dev-server to get hot refresh of the app.
  devServer: {
    static: './build',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        // Load CSS files. They can be imported into JS files.
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
      {
        // Load image assets.
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    // Step 1: Basic Robot Programming (DOM table grid simulator)
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: 'src/index.html',
      chunks: ['index'],
      favicon: 'src/assets/octopus-icon.png',
    }),
    // Step 2: Advanced Robot Simulator (Phaser 4 Engine simulator)
    new HtmlWebpackPlugin({
      filename: 'step2.html',
      template: 'src/step2.html',
      chunks: ['step2'],
      favicon: 'src/assets/octopus-icon.png',
    }),
  ],
};

module.exports = (env, argv) => {
  if (argv.mode === 'development') {
    // Set the output path to the `build` directory
    // so we don't clobber production builds.
    config.output.path = path.resolve(__dirname, 'build');

    // Generate source maps for our code for easier debugging.
    // Not suitable for production builds. If you want source maps in
    // production, choose a different one from https://webpack.js.org/configuration/devtool
    config.devtool = 'eval-cheap-module-source-map';

    // Include the source maps for Blockly for easier debugging Blockly code.
    config.module.rules.push({
      test: /(blockly[/\\].*\.js)$/,
      use: [require.resolve('source-map-loader')],
      enforce: 'pre',
    });

    // Ignore spurious warnings from source-map-loader
    // It can't find source maps for some Closure modules and that is expected
    config.ignoreWarnings = [/Failed to parse source map.*blockly/];
  }
  return config;
};
