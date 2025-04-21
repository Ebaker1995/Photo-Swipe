import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, PanResponder, Platform, TouchableOpacity, Button } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedGestureHandler, withSpring, runOnJS } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 0.25 * SCREEN_WIDTH;

const mockPhotos = [
  { uri: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb', id: '1', location: 'Yosemite, CA', date: '2021-07-20' },
  { uri: 'https://images.unsplash.com/photo-1465101046530-73398c7f28ca', id: '2', location: 'Paris, France', date: '2019-05-12' },
  { uri: 'https://images.unsplash.com/photo-1519125323398-675f0ddb6308', id: '3', location: 'New York, NY', date: '2020-10-04' },
  { uri: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e', id: '4', location: 'Tokyo, Japan', date: '2018-11-30' },
  { uri: 'https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d', id: '5', location: 'Sydney, Australia', date: '2022-01-15' },
  { uri: 'https://images.unsplash.com/photo-1503602642458-232111445657', id: '6', location: 'Rome, Italy', date: '2019-08-22' },
  { uri: 'https://images.unsplash.com/photo-1504208434309-cb69f4fe52b0', id: '7', location: 'Banff, Canada', date: '2021-09-18' },
];

export default function App() {
  const [photos, setPhotos] = useState(mockPhotos);
  const [kept, setKept] = useState([]);
  const [deleted, setDeleted] = useState([]);
  const [history, setHistory] = useState([]);
  const TOTAL_PHOTOS = mockPhotos.length;

  // Google Photos auth & album selection
  const [accessToken, setAccessToken] = useState(null);
  const [userId, setUserId] = useState(null);
  const [albums, setAlbums] = useState([]);
  const [selectedAlbum, setSelectedAlbum] = useState(null);

  const [request, response, promptAsync] = Google.useAuthRequest({
    expoClientId: '<YOUR_EXPO_CLIENT_ID>',
    iosClientId: '<YOUR_IOS_CLIENT_ID>',
    androidClientId: '<YOUR_ANDROID_CLIENT_ID>',
    webClientId: '<YOUR_WEB_CLIENT_ID>',
    scopes: ['https://www.googleapis.com/auth/photoslibrary.readonly'],
  });

  useEffect(() => {
    if (response?.type === 'success') {
      setAccessToken(response.authentication.accessToken);
    }
  }, [response]);

  useEffect(() => {
    if (accessToken) {
      (async () => {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
        const json = await res.json();
        setUserId(json.sub);
      })();
    }
  }, [accessToken]);

  const fetchAlbums = async () => {
    const res = await fetch('https://photoslibrary.googleapis.com/v1/albums?pageSize=50', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    setAlbums(json.albums || []);
  };

  const fetchPhotosInAlbum = async (albumId) => {
    const res = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ albumId, pageSize: 50 }),
    });
    const json = await res.json();
    const items = json.mediaItems || [];
    const mapped = items.map(item => ({
      uri: `${item.baseUrl}=w800-h800`,
      id: item.id,
      location: item.mediaMetadata.location
        ? `${item.mediaMetadata.location.latitude.toFixed(4)},${item.mediaMetadata.location.longitude.toFixed(4)}`
        : 'Unknown',
      date: item.mediaMetadata.creationTime,
    }));
    setPhotos(mapped);
    setSelectedAlbum(albumId);
  };

  const translateX = useSharedValue(0);
  const currentIndex = photos.length - 1;
  const currentPhotoData = photos[currentIndex] || {};

  const handleSwipe = (direction) => {
    const currentPhoto = photos[currentIndex];
    // Push current state to history for undo
    setHistory((prev) => [...prev, { photos, kept, deleted }]);
    // Apply swipe action
    if (direction === 'keep') {
      setKept((prev) => [...prev, currentPhoto]);
    } else {
      setDeleted((prev) => [...prev, currentPhoto]);
    }
    setPhotos((prev) => prev.slice(0, -1));
    translateX.value = 0;
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    // Restore state from history
    setPhotos(last.photos);
    setKept(last.kept);
    setDeleted(last.deleted);
    setHistory((prev) => prev.slice(0, -1));
    translateX.value = 0;
  };

  // For web: recreate panResponder each render to capture latest handleSwipe
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gestureState) => {
      translateX.value = gestureState.dx;
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dx > SWIPE_THRESHOLD) {
        handleSwipe('keep');
      } else if (gestureState.dx < -SWIPE_THRESHOLD) {
        handleSwipe('delete');
      } else {
        translateX.value = withSpring(0);
      }
    },
  });

  const gestureHandler = useAnimatedGestureHandler({
    onStart: (_, ctx) => {
      ctx.startX = translateX.value;
    },
    onActive: (event, ctx) => {
      translateX.value = ctx.startX + event.translationX;
    },
    onEnd: () => {
      if (translateX.value > SWIPE_THRESHOLD) {
        runOnJS(handleSwipe)('keep');
      } else if (translateX.value < -SWIPE_THRESHOLD) {
        runOnJS(handleSwipe)('delete');
      } else {
        translateX.value = withSpring(0);
      }
    },
  });

  const overlayStyle = useAnimatedStyle(() => {
    const opacity = Math.min(Math.abs(translateX.value) / SWIPE_THRESHOLD, 1);
    const backgroundColor = translateX.value > 0 ? 'rgba(0,255,0,0.3)' : 'rgba(255,0,0,0.3)';
    return { opacity, backgroundColor };
  });

  const keepBoxStyle = useAnimatedStyle(() => ({
    opacity: Math.min(Math.max(translateX.value, 0) / SWIPE_THRESHOLD, 1),
  }));
  const deleteBoxStyle = useAnimatedStyle(() => ({
    opacity: Math.min(Math.max(-translateX.value, 0) / SWIPE_THRESHOLD, 1),
  }));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { rotate: `${translateX.value * 0.05}deg` }
    ],
    opacity: photos.length ? 1 : 0,
  }));

  // Google Photos UI: login, load albums, select album
  if (!accessToken) {
    return (
      <View style={styles.container}>
        <Button title="Login with Google Photos" disabled={!request} onPress={() => promptAsync()} />
      </View>
    );
  }
  if (albums.length === 0) {
    return (
      <View style={styles.container}>
        {userId && <Text style={styles.counter}>Google User ID: {userId}</Text>}
        <Button title="Load Albums" onPress={fetchAlbums} />
      </View>
    );
  }
  if (!selectedAlbum) {
    return (
      <View style={styles.container}>
        <Text style={styles.counter}>Select an album:</Text>
        {albums.map(a => (
          <TouchableOpacity key={a.id} style={styles.albumItem} onPress={() => fetchPhotosInAlbum(a.id)}>
            <Text>{a.title}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <StatusBar style="auto" />
        {photos.length > 0 ? (
          <>
            <View style={{ width: SCREEN_WIDTH * 0.9, height: SCREEN_WIDTH * 1.2, alignItems: 'center', justifyContent: 'center' }}>
              {photos.length > 1 && (
                <Animated.View style={[styles.card, { position: 'absolute', transform: [{ scale: 0.95 }], opacity: 0.8 }]}>  
                  <Image source={{ uri: photos[currentIndex - 1].uri }} style={styles.image} />
                </Animated.View>
              )}
              {Platform.OS === 'web' ? (
                <Animated.View {...panResponder.panHandlers} style={[styles.card, animatedStyle, { zIndex: 1 }]}>  
                  <Animated.View style={[StyleSheet.absoluteFillObject, overlayStyle]} />
                  <Image source={{ uri: photos[currentIndex].uri }} style={styles.image} />
                  <Animated.View style={[styles.actionBox, styles.keepBox, keepBoxStyle]}>
                    <Text style={styles.actionText}>Keep</Text>
                  </Animated.View>
                  <Animated.View style={[styles.actionBox, styles.deleteBox, deleteBoxStyle]}>
                    <Text style={styles.actionText}>Delete</Text>
                  </Animated.View>
                </Animated.View>
              ) : (
                <PanGestureHandler onGestureEvent={gestureHandler}>
                  <Animated.View style={[styles.card, animatedStyle]}>  
                    <Animated.View style={[StyleSheet.absoluteFillObject, overlayStyle]} />
                    <Image source={{ uri: photos[currentIndex].uri }} style={styles.image} />
                    <Animated.View style={[styles.actionBox, styles.keepBox, keepBoxStyle]}>
                      <Text style={styles.actionText}>Keep</Text>
                    </Animated.View>
                    <Animated.View style={[styles.actionBox, styles.deleteBox, deleteBoxStyle]}>
                      <Text style={styles.actionText}>Delete</Text>
                    </Animated.View>
                  </Animated.View>
                </PanGestureHandler>
              )}
            </View>
            <View style={styles.infoContainer}>
              <Text style={styles.counter}>{photos.length} of {TOTAL_PHOTOS}</Text>
              <Text style={styles.metadata}>Location: {currentPhotoData.location}</Text>
              <Text style={styles.metadata}>Taken: {currentPhotoData.date}</Text>
              <Text style={styles.instruction}>Swipe right to keep, left to delete</Text>
              {history.length > 0 && (
                <TouchableOpacity style={styles.undoButton} onPress={handleUndo}>
                  <Text style={styles.undoText}>Undo</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <View style={styles.doneContainer}>
            <Text style={styles.doneText}>No more photos!</Text>
            <Text style={styles.resultText}>Kept: {kept.length} | Deleted: {deleted.length}</Text>
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: SCREEN_WIDTH * 0.9,
    height: SCREEN_WIDTH * 1.2,
    overflow: 'hidden',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 6,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  counter: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  instruction: {
    fontSize: 16,
    color: '#888',
  },
  infoContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  doneContainer: {
    alignItems: 'center',
  },
  doneText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  resultText: {
    fontSize: 18,
    color: '#555',
  },
  actionBox: {
    position: 'absolute',
    bottom: 20,
    width: 120,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keepBox: {
    left: 20,
    backgroundColor: 'rgba(0,128,0,0.8)',
  },
  deleteBox: {
    right: 20,
    backgroundColor: 'rgba(255,0,0,0.8)',
  },
  actionText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  undoButton: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#2196f3',
    borderRadius: 4,
  },
  undoText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  metadata: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  albumItem: {
    padding: 12,
    marginVertical: 4,
    backgroundColor: '#eee',
    width: '90%',
    alignItems: 'center',
    borderRadius: 8,
  },
});
