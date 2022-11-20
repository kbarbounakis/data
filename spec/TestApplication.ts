import { IApplication, ConfigurationBase } from "@themost/common";
import {resolve} from 'path';
import {
    DataConfigurationStrategy,
    NamedDataContext,
    DataContext,
    DataApplication,
    DataCacheStrategy,
    DataCacheFinalize
} from '../index';

export class TestApplication extends IApplication {

    private _services: Map<any,any> = new Map();
    private _configuration: ConfigurationBase;

    useStrategy(serviceCtor: void, strategyCtor: void): this {
        const ServiceClass: any = serviceCtor;
        const StrategyClass: any = strategyCtor;
        this._services.set(ServiceClass.name, new StrategyClass(this));
        return this;
    }
    hasStrategy(serviceCtor: void): boolean {
        return this._services.has((<any>serviceCtor).name);
    }
    getStrategy<T>(serviceCtor: new () => T): T {
        return this._services.get(serviceCtor.name);
    }
    getConfiguration(): ConfigurationBase {
        return this._configuration;
    }
    constructor(executionPath: string) {
        super();
        // init application configuration
        this._configuration = new ConfigurationBase(resolve(executionPath, 'config'));

        this._configuration.setSourceAt('adapterTypes', [
            {
                'name':'Test Data Adapter', 
                'invariantName': 'test',
                'type': resolve(__dirname, 'adapter/TestAdapter')
            }
        ]);
        this._configuration.setSourceAt('adapters', [
            { 
                'name': 'test-storage',
                'invariantName': 'test',
                'default':true,
                "options": {
                }
            }
        ]);
        // use data configuration strategy
        this._configuration.useStrategy(DataConfigurationStrategy, DataConfigurationStrategy);
    }

    createContext(): DataContext {
        const adapters = this._configuration.getSourceAt('adapters');
        const adapter: { name: string; invariantName: string; default: boolean } = adapters.find((item: any)=> {
            return item.default;
        });
        const context = new NamedDataContext(adapter.name);
        context.getConfiguration = () => {
            return this._configuration;
        };
        return context;
    }

    async finalize(): Promise<void> {
        const service = this.getConfiguration().getStrategy(DataCacheStrategy) as unknown as DataCacheFinalize;
        if (typeof service.finalize === 'function') {
            await service.finalize();
        }
    }

}

export class TestApplication2 extends TestApplication {
    constructor() {
        super(resolve(__dirname, 'test2'));
        this.getConfiguration().getSourceAt('adapters').unshift({
            name: 'test-local',
            invariantName: 'test',
            default: true,
            options: {
                database: resolve(__dirname, 'test2/db/local.db')
            }
        });
    }
}
