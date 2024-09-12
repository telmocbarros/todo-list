const path = require("path");
// Simplifies the process of creating HTML files to serve your bundled JavaScript files
// It automatically inject the generated script tags into the HTML file
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
  // Specifies the entry point of the application
  entry: path.join(__dirname, "src", "index.js"),
  // Specifies where the bundled code should be generated
  output: {
    path: path.resolve(__dirname, "dist"),
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "public", "index.html"),
    }),
  ],
  module: {
    // Configures webpack to use Babel for transpiling JavaScript files
    rules: [
      {
        test: /\.?js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-react"],
          },
        },
      },
      {
        test: /\.css$/,
        // These loaders help process css files
        use: ['style-loader', 'css-loader']
      }
    ],
  },
  // Configures the development server
  devServer: {
    port: 3000,
  },
};
