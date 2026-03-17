import postcssPresetEnv from 'postcss-preset-env';
import autoprefixer from 'autoprefixer';


const config = {
  plugins: [
    postcssPresetEnv({
      stage: 3,
      features: {
        'nesting-rules': true,
      },
    }),
    autoprefixer(),
  ],
};

export default config;
