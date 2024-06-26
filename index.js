import React, { useState, useEffect, useRef } from 'react';
import { requireNativeComponent, NativeModules, Platform, Image, View } from 'react-native';

const LINKING_ERROR =
  `The package 'react-native-blasted-image' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const NativeBlastedImage = NativeModules.BlastedImage
  ? NativeModules.BlastedImage
  : new Proxy(
    {},
    {
      get() {
        throw new Error(LINKING_ERROR);
      },
    }
  );

export const loadImage = (imageUrl, headers = {}, skipMemoryCache = false) => {
  return NativeBlastedImage.loadImage(imageUrl, headers, skipMemoryCache)
    .catch((error) => {
      console.error("Error loading image:", error, + " " + imageUrl);
      throw error;
    });
};

const BlastedImageView = requireNativeComponent('BlastedImageView');

const BlastedImage = ({ source, width, onLoad, onError, fallbackSource, height, style, resizeMode, isBackground, children }) => {
  const [error, setError] = useState(false);

  if (!source || (!source.uri && typeof source !== 'number')) {
    if (!source) {
      console.error("Source not specified for BlastedImage.");
    } else {
      console.error("Source should be either a URI <BlastedImage source={{ uri: 'https://example.com/image.jpg' }} /> or a local image using <BlastedImage source={ require('https://example.com/image.jpg') } />");
    }
    return null;
  }

  useEffect(() => {
    if (typeof source === 'number') {
      return;
    }

    const fetchImage = async () => {
      try {
        setError(false);
        await loadImage(source.uri, source.headers);
        onLoad?.();
      } catch (err) {
        setError(true);
        console.error(err);
        onError?.(err);
      }
    };

    fetchImage();
  }, [source]);

  // Flatten styles if provided as an array, otherwise use style as-is
  const flattenedStyle = Array.isArray(style) ? Object.assign({}, ...style) : style;

  const defaultStyle = { overflow: 'hidden', position: 'relative', backgroundColor: style?.borderColor || 'transparent' }; // Use border color as background

  const {
    width: styleWidth,  // Get width from style
    height: styleHeight, // Get height from style
    ...remainingStyle // All other styles excluding above
  } = flattenedStyle || {};

  // Override width and height if they exist in style
  width = width || styleWidth || 100; // First check the direct prop, then style, then default to 100
  height = height || styleHeight || 100; // First check the direct prop, then style, then default to 100

  const {
    borderWidth = 0,
    borderTopWidth = borderWidth,
    borderBottomWidth = borderWidth,
    borderLeftWidth = borderWidth,
    borderRightWidth = borderWidth,
  } = remainingStyle;

  const [parentDimensions, setParentDimensions] = useState({ width: 0, height: 0 });
  const parentViewRef = useRef();

  // Handler for layout changes
  const onLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    setParentDimensions({ width, height });
  };

  // Convert percentage dimensions to pixels based on parent dimensions
  const resolveDimension = (dimension, baseSize) => {
    if (typeof dimension === 'string' && dimension.includes('%')) {
      const percentValue = parseFloat(dimension) / 100;
      return baseSize * percentValue;
    }
    return parseFloat(dimension); // Ensure numerical value is returned
  };

  const resolvedWidth = resolveDimension(width, parentDimensions.width);
  const resolvedHeight = resolveDimension(height, parentDimensions.height);

  // Calculate the adjusted width and height
  const adjustedWidth = resolvedWidth - (borderLeftWidth + borderRightWidth);
  const adjustedHeight = resolvedHeight - (borderTopWidth + borderBottomWidth);

  const viewStyle = {
    ...defaultStyle,
    ...remainingStyle,
    width,
    height,
  };

  const childrenStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: adjustedWidth,
    height: adjustedHeight,
  };

  return (
    <View ref={parentViewRef} onLayout={onLayout} style={!isBackground ? viewStyle : null}>
      {isBackground ? (
        <View style={viewStyle}>
          {renderImageContent(error, source, fallbackSource, adjustedHeight, adjustedWidth, resizeMode)}
        </View>
      ) : (
        renderImageContent(error, source, fallbackSource, adjustedHeight, adjustedWidth, resizeMode)
      )}
      {isBackground && <View style={childrenStyle}>{children}</View>}
    </View>
  );
};

function renderImageContent(error, source, fallbackSource, adjustedHeight, adjustedWidth, resizeMode) {
  if (error) {
    if (fallbackSource) { // Error - Fallback specified, use native component
      return (
        <Image
          source={fallbackSource}
          style={{ width: adjustedHeight, height: adjustedHeight }}
          resizeMode={resizeMode}
        />
      );
    } else { // Error - No fallback, use native component with static asset
      return (
        <Image
          source={require('./assets/image-error.png')}
          style={{ width: adjustedHeight, height: adjustedHeight }}
          resizeMode={resizeMode}
        />
      );
    }
  } else if (typeof source === 'number') { // Success - with local asset
    return (
      <Image
        source={source}
        style={{ width: adjustedWidth, height: adjustedHeight }}
        resizeMode={resizeMode}
      />
    );
  } else { // Success - with remote asset
    return (
      <BlastedImageView
        sourceUri={source.uri}
        width={adjustedWidth}
        height={adjustedHeight}
        resizeMode={resizeMode}
      />
    );
  }
}

BlastedImage.defaultProps = {
  resizeMode: "cover",
  isBackground: false,
  fallbackSource: null
};

// clear memory cache
BlastedImage.clearMemoryCache = () => {
  return NativeBlastedImage.clearMemoryCache();
};

// clear disk cache
BlastedImage.clearDiskCache = () => {
  return NativeBlastedImage.clearDiskCache();
};

// clear disk and memory cache
BlastedImage.clearAllCaches = () => {
  return NativeBlastedImage.clearAllCaches();
};

BlastedImage.preload = (input) => {
  return new Promise((resolve) => {
    // single object
    if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
      loadImage(input.uri, input.headers, input.skipMemoryCache)
        .then(() => {
          resolve();
        })
        .catch((err) => {
          console.error("Error preloading single image:", err, + " " + input.uri);
          resolve(); // Count as handled even if failed to continue processing
        });
    }
    // array
    else if (Array.isArray(input)) {
      let loadedCount = 0;
      input.forEach(image => {
        loadImage(image.uri, image.headers, image.skipMemoryCache)
          .then(() => {
            loadedCount++;
            if (loadedCount === input.length) {
              resolve();
            }
          })
          .catch((err) => {
            console.error("Error preloading one of the array images:", err, + " " + image.uri);
            loadedCount++; // Count as handled even if failed to continue processing
            if (loadedCount === input.length) {
              resolve();
            }
          });
      });
    }
  });
};


export default BlastedImage;
