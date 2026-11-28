import {
  clampZoom,
  fitToContent,
  INITIAL_VIEW,
  panBy,
  type Rect,
  type View as ViewState,
  zoomAt,
} from "@agent-board/app/board/viewport";
import { type ComponentRef, type ReactNode, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, View } from "react-native";

import { AppText } from "../AppText";
import { styles } from "../styles";

const ZOOM_STEP = 1.2;

type Box = { x: number; y: number; width: number; height: number };

// Folding remounts the canvas, so each board's view outlives it for the session.
const keptViews = new Map<string, ViewState>();

/** The canvas's pan and zoom state, kept outside React so a touch move rewrites it without a render. */
function createCanvasGesture(kept: ViewState | undefined, onSettle: (view: ViewState) => void) {
  let origin: Box = { x: 0, y: 0, width: 0, height: 0 };
  let view: ViewState = kept ?? INITIAL_VIEW;
  let start: ViewState = INITIAL_VIEW;
  let pinch: { distance: number; mid: [number, number] } | null = null;
  // The content to fit on a double tap, from the content view's last layout.
  let content: Rect | null = null;
  let lastTap = 0;
  const values = {
    x: new Animated.Value(view.x),
    y: new Animated.Value(view.y),
    k: new Animated.Value(view.k),
  };
  const apply = (next: ViewState) => {
    view = next;
    values.x.setValue(next.x);
    values.y.setValue(next.y);
    values.k.setValue(next.k);
  };
  const settle = () => onSettle(view);
  const fit = (target: Rect) => {
    apply(fitToContent(target, origin));
    settle();
  };
  const responder = PanResponder.create({
    // Only a touch no card took reaches the canvas, so a tap on empty canvas can count toward a double tap.
    onStartShouldSetPanResponder: () => true,
    // A lane's ScrollView would otherwise take the second finger, so a pinch is claimed before it.
    onMoveShouldSetPanResponderCapture: (_event, move) => move.numberActiveTouches === 2,
    onMoveShouldSetPanResponder: (_event, move) =>
      move.numberActiveTouches === 2 || Math.abs(move.dx) + Math.abs(move.dy) > 8,
    onPanResponderGrant: () => {
      start = view;
      pinch = null;
    },
    onPanResponderMove: (event, move) => {
      const [a, b] = event.nativeEvent.touches;
      if (a !== undefined && b !== undefined) {
        const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
        const mid: [number, number] = [
          (a.pageX + b.pageX) / 2 - origin.x,
          (a.pageY + b.pageY) / 2 - origin.y,
        ];
        if (pinch === null) {
          start = view;
          pinch = { distance, mid };
          return;
        }
        const moved = panBy(start, mid[0] - pinch.mid[0], mid[1] - pinch.mid[1]);
        apply(zoomAt(moved, (start.k * distance) / pinch.distance, mid[0], mid[1]));
        return;
      }
      if (pinch === null) apply(panBy(start, move.dx, move.dy));
    },
    onPanResponderRelease: (_event, move) => {
      settle();
      if (pinch !== null || Math.abs(move.dx) + Math.abs(move.dy) > 8) return;
      const now = Date.now();
      if (now - lastTap < 300 && content !== null) fit(content);
      lastTap = now;
    },
    onPanResponderTerminate: settle,
  });
  return {
    values,
    responder,
    fit,
    remember: (next: Rect) => {
      content = next;
    },
    zoomBy: (factor: number) => {
      apply(zoomAt(view, clampZoom(view.k * factor), origin.width / 2, origin.height / 2));
      settle();
    },
    /** Records where the canvas sits on screen; true the first time with no kept view, when it should fit. */
    measured: (box: Box) => {
      const first = origin.width === 0 && kept === undefined;
      origin = box;
      return first;
    },
  };
}

/**
 * The desktop canvas's pan and zoom with touch: one finger pans, two fingers pinch, and the
 * desktop's zoom buttons sit top right, and a double tap fits. Built on core PanResponder, so gestures run on the JS thread.
 */
export function PanZoom({
  viewKey,
  content,
  children,
}: {
  viewKey: string;
  content: Rect;
  children: ReactNode;
}) {
  const frame = useRef<ComponentRef<typeof View>>(null);
  const [percent, setPercent] = useState(() => Math.round((keptViews.get(viewKey)?.k ?? 1) * 100));
  const [gesture] = useState(() =>
    createCanvasGesture(keptViews.get(viewKey), (view) => {
      keptViews.set(viewKey, view);
      setPercent(Math.round(view.k * 100));
    }),
  );
  const fit = () => gesture.fit(content);
  return (
    <View
      ref={frame}
      style={styles.canvas}
      onLayout={() =>
        frame.current?.measureInWindow((x, y, width, height) => {
          if (gesture.measured({ x, y, width, height })) fit();
        })
      }
      {...gesture.responder.panHandlers}
    >
      <Animated.View
        onLayout={() => gesture.remember(content)}
        style={[
          styles.canvasContent,
          {
            width: content.x + content.width,
            height: content.y + content.height,
            transform: [
              { translateX: gesture.values.x },
              { translateY: gesture.values.y },
              { scale: gesture.values.k },
            ],
          },
        ]}
      >
        {children}
      </Animated.View>
      <View style={styles.zoomControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
          onPress={() => gesture.zoomBy(ZOOM_STEP)}
          style={styles.zoomButton}
        >
          <AppText style={styles.bold}>+</AppText>
        </Pressable>
        <AppText style={styles.zoomPercent}>{percent}%</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
          onPress={() => gesture.zoomBy(1 / ZOOM_STEP)}
          style={styles.zoomButton}
        >
          <AppText style={styles.bold}>−</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fit to content"
          onPress={fit}
          style={styles.zoomButton}
        >
          <AppText style={styles.small}>Fit</AppText>
        </Pressable>
      </View>
    </View>
  );
}
