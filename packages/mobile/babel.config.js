module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "@tamagui/babel-plugin",
        {
          components: ["@tamagui/core"],
          config: "./tamagui.config.ts",
        },
      ],
      // Required by @powersync/react-native for its async-iterator-based
      // watched queries (`db.watch()`), see the RN/Expo setup docs:
      // https://docs.powersync.com/client-sdks/reference/react-native-and-expo
      "@babel/plugin-transform-async-generator-functions",
      "react-native-reanimated/plugin", // must be last
    ],
  };
};
