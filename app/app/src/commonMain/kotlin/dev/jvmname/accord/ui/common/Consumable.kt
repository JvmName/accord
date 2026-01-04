package dev.jvmname.accord.ui.common

//a la SingleLiveEvent
class Consumable<T>(private val value: T) {
    private var consumed = false

    fun consume(): T? {
        return when {
            consumed -> null
            else -> {
                consumed = true
                value
            }
        }
    }

    override fun equals(other: Any?): Boolean = value == other
    override fun hashCode(): Int = value.hashCode()
    override fun toString(): String = value.toString()
}

inline fun <T> consumableOf(value: T) = Consumable(value)