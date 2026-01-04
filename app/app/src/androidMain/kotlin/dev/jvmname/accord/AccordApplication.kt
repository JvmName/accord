package dev.jvmname.accord

import android.app.Application
import dev.jvmname.accord.di.AccordGraph
import dev.zacsweers.metro.createGraphFactory
import kotlin.time.Clock

class AccordApplication : Application() {
    lateinit var graph: AccordGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = createGraphFactory<AccordGraph.Factory>()
            .create(this, Clock.System)
    }
}