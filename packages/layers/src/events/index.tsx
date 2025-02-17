import React, { useState, useRef, useMemo } from "react";
import { useEditor, NodeId, Indicator, Node } from "@craftjs/core";
import { useLayerManager } from "../manager/useLayerManager";
import {
  useHandlerGuard,
  RenderIndicator,
  useConnectorHooks,
  ConnectorElementWrapper
} from "@craftjs/utils";
import { LayerState } from "../interfaces";

export type EventContext = {
  layer: ConnectorElementWrapper;
  layerHeader: ConnectorElementWrapper;
  drag: ConnectorElementWrapper;
};

export const EventContext = React.createContext<EventContext>(
  {} as EventContext
);

export const EventManager: React.FC<any> = ({ children }) => {
  const { layers, events, actions } = useLayerManager(state => state);
  const {
    query,
    actions: managerActions,
    enabled,
    connectors: editorConnectors
  } = useEditor(state => ({ enabled: state.options.enabled }));
  const { indicator: indicatorStyles } = query.getOptions();
  const [indicator, setInnerIndicator] = useState<
    | (Indicator & {
        onCanvas: boolean;
      })
    | null
  >(null);

  const dom = useRef<HTMLElement | null>(null);
  const mutable = useRef<
    Omit<LayerState, "options"> & {
      indicator: Indicator | null;
      currentCanvasHovered: Node | null;
    }
  >({
    layers,
    events,
    indicator,
    currentCanvasHovered: null
  });

  mutable.current = {
    layers,
    events,
    indicator,
    currentCanvasHovered: mutable.current.currentCanvasHovered
  };

  const indicatorPosition = useMemo(() => {
    if (indicator) {
      const {
        placement: { where, parent, currentNode },
        error
      } = indicator;
      const layerId = currentNode ? currentNode.id : parent.id;

      let top;
      const color = error ? indicatorStyles.error : indicatorStyles.success;

      if (indicator.onCanvas && layers[parent.id].dom != null) {
        const parentPos = layers[parent.id].dom.getBoundingClientRect();
        const parentHeadingPos = layers[
          parent.id
        ].headingDom.getBoundingClientRect();
        return {
          top: parentHeadingPos.top,
          left: parentPos.left,
          width: parentPos.width,
          height: parentHeadingPos.height,
          background: "transparent",
          borderWidth: "1px",
          borderColor: color
        };
      } else {
        if (!layers[layerId]) return;
        const headingPos = layers[layerId].headingDom.getBoundingClientRect();
        const pos = layers[layerId].dom.getBoundingClientRect();

        if (where === "after" || !currentNode) {
          top = pos.top + pos.height;
        } else {
          top = pos.top;
        }

        return {
          top,
          left: headingPos.left,
          width: pos.width,
          height: 2,
          borderWidth: 0,
          background: color
        };
      }
    }
  }, [indicator, indicatorStyles.error, indicatorStyles.success, layers]);

  const draggedNode = useRef<string | null>(null);
  const handlers = useHandlerGuard(
    {
      onDragStart: [
        "dragstart",
        (e: MouseEvent, id: string) => {
          e.stopPropagation();
          draggedNode.current = id;
        }
      ],
      onMouseOver: [
        "mouseover",
        (e: MouseEvent, id: NodeId) => {
          e.stopPropagation();
          actions.setLayerEvent("hovered", id);
        }
      ],
      onDragOver: [
        "dragover",
        (e, id) => {
          e.preventDefault();
          e.stopPropagation();

          const { indicator, layers, currentCanvasHovered } = mutable.current;

          if (
            currentCanvasHovered &&
            indicator &&
            currentCanvasHovered.data.nodes
          ) {
            const heading = layers[
              currentCanvasHovered.id
            ].headingDom.getBoundingClientRect();
            if (
              e.clientY > heading.top + 10 &&
              e.clientY < heading.bottom - 10
            ) {
              const currNode =
                currentCanvasHovered.data.nodes[
                  currentCanvasHovered.data.nodes.length - 1
                ];
              if (!currNode) return;
              indicator.placement.currentNode = query.node(currNode).get();
              indicator.placement.index =
                currentCanvasHovered.data.nodes.length;
              indicator.placement.where = "after";
              indicator.placement.parent = currentCanvasHovered;

              setInnerIndicator({
                ...indicator,
                onCanvas: true
              });
            }
          }
        }
      ],
      onDragEnter: [
        "dragenter",
        (e, id) => {
          e.preventDefault();
          e.stopPropagation();
          const { layers } = mutable.current;
          const { current: dragId } = draggedNode;

          if (!dragId) return;

          let target = id;

          const indicatorInfo = query.getDropPlaceholder(
            dragId,
            target,
            { x: e.clientX, y: e.clientY },
            node => layers[node.id] && layers[node.id].dom
          );

          let onCanvas;
          if (indicatorInfo) {
            const {
              placement: { parent }
            } = indicatorInfo;
            const parentHeadingInfo = layers[
              parent.id
            ].headingDom.getBoundingClientRect();

            mutable.current.currentCanvasHovered = null;
            if (query.node(parent.id).isCanvas()) {
              if (parent.data.parent) {
                const grandparent = query.node(parent.data.parent).get();
                if (query.node(grandparent.id).isCanvas()) {
                  mutable.current.currentCanvasHovered = parent;
                  if (
                    (e.clientY > parentHeadingInfo.bottom - 10 &&
                      !layers[parent.id].expanded) ||
                    e.clientY < parentHeadingInfo.top + 10
                  ) {
                    indicatorInfo.placement.parent = grandparent;
                    indicatorInfo.placement.currentNode = parent;
                    indicatorInfo.placement.index = grandparent.data.nodes
                      ? grandparent.data.nodes.indexOf(parent.id)
                      : 0;
                    if (
                      e.clientY > parentHeadingInfo.bottom - 10 &&
                      !layers[parent.id].expanded
                    ) {
                      indicatorInfo.placement.where = "after";
                    } else if (e.clientY < parentHeadingInfo.top + 10) {
                      indicatorInfo.placement.where = "before";
                    }
                  }
                }
              }
            }
            setInnerIndicator({
              ...indicatorInfo,
              onCanvas
            });
          }
        }
      ],
      onDragEnd: [
        "dragend",
        (e: MouseEvent) => {
          e.stopPropagation();
          const events = mutable.current;
          if (events.indicator && !events.indicator.error) {
            const { placement } = events.indicator;
            const { parent, index, where } = placement;
            const { id: parentId } = parent;

            managerActions.move(
              draggedNode.current as NodeId,
              parentId,
              index + (where === "after" ? 1 : 0)
            );
          }

          draggedNode.current = null;
          setInnerIndicator(null);
        }
      ]
    },
    enabled
  );

  const connectors = useConnectorHooks(
    {
      layer: (node, id) => {
        editorConnectors.select(node, id);
        editorConnectors.hover(node, id);
        handlers.onMouseOver(node, id);
        handlers.onDragOver(node, id);
        handlers.onDragEnter(node, id);
        handlers.onDragEnd(node, id);
        editorConnectors.drag(node, id);

        actions.setDOM(id, {
          dom: node
        });
      },
      layerHeader: (node, id) => {
        actions.setDOM(id, {
          headingDom: node
        });
      },
      drag: [
        (node, id) => {
          node.setAttribute("draggable", "true");
          handlers.onDragStart(node, id);
        },
        (node, id) => node.removeAttribute("draggable")
      ]
    },
    enabled
  ) as any;

  // const onOver = useCallback((e: MouseEvent) => {
  //     const { layers } = mutable.current;
  //     if ( layers && layers[ROOT_NODE]) {
  //         if (!layers[ROOT_NODE].dom.contains(e.target as HTMLElement)) {
  //             actions.setLayerEvent('hovered', null);
  //         }
  //     }

  // }, []);

  // useEffect(() => {
  //     // if ( mutable.current.layers[ROOT_NODE] )
  //     window.addEventListener("mouseover", onOver);

  //     return (() => {
  //         window.removeEventListener("mouseover", onOver)
  //     })
  // }, []);

  return (
    <EventContext.Provider value={connectors}>
      <div
        ref={node => {
          if (dom.current) {
            dom.current = node;
          }
        }}
      >
        {indicator
          ? React.createElement(RenderIndicator, {
              style: indicatorPosition
            })
          : null}
        {children}
      </div>
    </EventContext.Provider>
  );
};
