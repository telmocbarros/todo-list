const path = require('path');
// Simplifies the process of creating HTML files to serve your bundled JavaScript files
// It automatically inject the generated script tags into the HTML file
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  // Specifies the entry point of the application
  entry: path.join(__dirname, 'src', 'index.tsx'),
  // Specifies where the bundled code should be generated
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'public', 'index.html'),
    }),
  ],
  module: {
    // Configures webpack to use Babel for transpiling JavaScript files
    rules: [
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
      {
        test: /\.css$/,
        // These loaders help process css files
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  // Configures the development server
  devServer: {
    port: 3000,
  },
};
