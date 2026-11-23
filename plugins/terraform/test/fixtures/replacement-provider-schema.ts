import { resolveCeSchemaFixture } from '../../../platform/test/fixtures/resolve-schema-fixture';
import compact from './securemesh-replacement-provider-schema.json';
import shared from './shared-schema-components.json';

export default resolveCeSchemaFixture(compact, shared);
