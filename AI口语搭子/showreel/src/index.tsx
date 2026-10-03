import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {ProductShowreel} from './ProductShowreel';

const Root = () => <>
  <Composition id="ProductShowreel" component={ProductShowreel} fps={30} durationInFrames={900} width={1280} height={720} defaultProps={{audit:false}} />
  <Composition id="MotionAudit" component={ProductShowreel} fps={30} durationInFrames={900} width={1280} height={720} defaultProps={{audit:true}} />
  <Composition id="ActionSample" component={ProductShowreel} fps={30} durationInFrames={300} width={1280} height={720} defaultProps={{audit:false}} />
  <Composition id="StructureSample" component={ProductShowreel} fps={30} durationInFrames={540} width={1280} height={720} defaultProps={{audit:false}} />
</>;
registerRoot(Root);
