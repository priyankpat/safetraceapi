import React, { Component, useEffect } from "react";
import { ScrollView, Text } from "react-native";
import * as Location from "expo-location";
import Icon from "react-native-vector-icons/FontAwesome5";
import moment from "moment";
import * as TaskManager from "expo-task-manager";
import { useSelector } from "react-redux";
import { useDispatch } from "react-redux";
import { NativeModules } from "react-native";
import { encrypt, decrypt, PrivateKey } from "eciesjs";
import base64 from "react-native-base64";

import {
  LocationListViewContainer,
  LocationListViewItem,
  LocationListViewLabel,
  LocationListViewValue,
} from "./styles";
import {
  locationSlice,
  selectPosition,
  selectBitData,
  selectFences,
  getNodes,
  selectNodes,
  postShares,
} from "../../store/location.slice";
import { Button } from "../../components";

// export class LocationScreen extends Component {
//   state = {
//     location: {},
//     error: '',
//     hasPermission: '',
//   };

//   registerListener = () => {
//     Location.watchPositionAsync({}, (data) => {
//       this.setState({ location: data });
//     });
//   };

//   registerFences = () => {
//     this.registerListener();
//     Location.startGeofencingAsync('fences', Fences);
//     // alert(JSON.stringify(Fences));
//   }

//   componentDidMount() {
//     // this.getPermissionsAndLocation();
//     this.registerFences();

//     TaskManager.defineTask('fences', ({ data: { eventType, region }, error }) => {
//       console.log('task triggered', eventType);
//       if (error) {
//         // check `error.message` for more details.
//         return;
//       }
//       if (eventType === Location.GeofencingEventType.Enter) {
//         console.log('You\'ve entered region:', region);
//       } else if (eventType === Location.GeofencingEventType.Exit) {
//         console.log('You\'ve left region:', region);
//       }
//     });
//   }

//   render() {
//     const { location, error } = this.state;

//     if (!!error) {
//       return (
//         <View>
//           <Text>{error}</Text>
//         </View>
//       );
//     }

//     return (
//       <LocationListViewContainer>
//         <LocationListViewItem>
//           <LocationListViewLabel>Timestamp</LocationListViewLabel>
//           <LocationListViewValue>{moment(location?.timestamp).format('YY/MM/DD-HH:mm:ss')}</LocationListViewValue>
//         </LocationListViewItem>
//         <LocationListViewItem>
//           <LocationListViewLabel>Mocked</LocationListViewLabel>
//           <LocationListViewValue>{location?.mocked ? (
//             <Icon name="check" />
//           ) : (
//             <Icon name="times" />
//           )}</LocationListViewValue>
//         </LocationListViewItem>
//         <LocationListViewItem>
//           <LocationListViewLabel>Latitude</LocationListViewLabel>
//           <LocationListViewValue>{location?.coords?.latitude}</LocationListViewValue>
//         </LocationListViewItem>
//         <LocationListViewItem>
//           <LocationListViewLabel>Longitude</LocationListViewLabel>
//           <LocationListViewValue>{location?.coords?.longitude}</LocationListViewValue>
//         </LocationListViewItem>
//         <LocationListViewItem>
//           <LocationListViewLabel>Speed</LocationListViewLabel>
//           <LocationListViewValue>{location?.coords?.speed}</LocationListViewValue>
//         </LocationListViewItem>
//         <LocationListViewItem>
//           <LocationListViewLabel>Accuracy</LocationListViewLabel>
//           <LocationListViewValue>{location?.coords?.accuracy}</LocationListViewValue>
//         </LocationListViewItem>
//       </LocationListViewContainer>
//     );
//   }
// }

// timestamp, mocked, coords, altitude, longitude, speed, latitude, accuracy

export const LocationScreen = () => {
  const position = useSelector(selectPosition);
  const bitData = useSelector(selectBitData);
  const fences = useSelector(selectFences);
  const nodes = useSelector(selectNodes);
  const dispatch = useDispatch();

  useEffect(() => {
    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Highest,
        timeInterval: 5000,
        distanceInterval: 40,
      },
      (data) => {
        dispatch(locationSlice.actions.updatePosition({ position: data }));
      }
    );

    TaskManager.defineTask("fences", ({ data, error }) => {
      const { eventType, region } = data;
      if (error) {
        // check `error.message` for more details.
        return;
      }
      if (eventType === Location.GeofencingEventType.Enter) {
        console.log("You've entered region:", region);
      } else if (eventType === Location.GeofencingEventType.Exit) {
        console.log("You've left region:", region);
      }

      if (eventType === Location.GeofencingEventType.Enter) {
        dispatch(locationSlice.actions.computeDataOnFenceTrigger({ data }));
      }
    });
  }, []);

  function b64encode(arr) {
    let binary = "";
    let len = arr.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(arr[i]);
    }
    return base64.encode(binary);
  }

  return (
    <ScrollView>
      <Button
        onPress={() => {
          Location.stopGeofencingAsync("fences");
          dispatch(getNodes());
          dispatch(locationSlice.actions.startRecording());

          setTimeout(() => {
            Location.startGeofencingAsync("fences", fences)
              .then()
              .catch((err) => console.log("failed to register fences"));
          }, 3000);
        }}
        label="Start Recording"
      />
      <Text>{JSON.stringify(position)}</Text>
      <Text>{JSON.stringify(bitData)}</Text>
      <Button
        onPress={() => {
          const bitStrData = bitData.join("");
          console.log("split input", bitStrData);
          let shares;
          const sharesBody = [];

          NativeModules.MPCModule.splitShares(bitStrData)
            .then((data: string) => {
              shares = data;
              var jsonData = JSON.parse(data);
              var share1 = [];
              var share2 = [];
              var share3 = [];
              var i = 0;

              try {
                for (const share in jsonData) {
                  console.log(share);

                  if (jsonData[share][0] === 1) {
                    share1.push(jsonData[share]);
                  }

                  if (jsonData[share][0] === 2) {
                    share2.push(jsonData[share]);
                  }

                  if (jsonData[share][0] === 3) {
                    share3.push(jsonData[share]);
                  }

                  i++;
                }

                console.log(share1, share2, share3);

                for (const i in nodes) {
                  const node = nodes[i];

                  if (!!node) {
                    if (node.node_id === 1) {
                      const d = Buffer.from(JSON.stringify({ share1 }));
                      const buf = encrypt(node.public_key, share1);
                      const encoded = b64encode(buf);

                      sharesBody.push({
                        node_id: node.node_id,
                        share: encoded,
                      });
                    }

                    if (node.node_id === 2) {
                      const d = Buffer.from(JSON.stringify({ share2 }));
                      const buf = encrypt(node.public_key, share3);
                      const encoded = b64encode(buf);

                      sharesBody.push({
                        node_id: node.node_id,
                        share: encoded,
                      });
                    }

                    if (node.node_id === 3) {
                      const d = Buffer.from(JSON.stringify({ share3 }));
                      const buf = encrypt(node.public_key, share3);
                      const encoded = b64encode(buf);

                      sharesBody.push({
                        node_id: node.node_id,
                        share: encoded,
                      });
                    }
                  }
                }

                dispatch(
                  postShares(
                    JSON.stringify({
                      shares: sharesBody,
                    })
                  )
                );
              } catch (err) {
                console.log(err);
              }

              // for(const i in nodes) {
              //   const node = nodes[i];
              //   if (!!node) {
              //     sharesBody.push({
              //       node_id: node.node_id,
              //       share: JSON.stringify({
              //         result: data
              //       })
              //     });
              //   }
              // }

              // const body = JSON.stringify({
              //       shares: sharesBody,
              //     });
              //     alert(body);

              // dispatch(postShares(body));
            })
            .catch((err: any) => alert("err: " + err));
        }}
        label="Stop Recording"
      />
    </ScrollView>
  );
};
